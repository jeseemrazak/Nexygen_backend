import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';
import { PosStaffService } from './pos-staff.service';
import { CreatePosSaleDto } from './dto/create-pos-sale.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  paymentMethod: true,
  servedBy: { select: { id: true, name: true } },
  session: { include: { warehouse: true } },
  customer: true,
};

@Injectable()
export class PosSalesService {
  constructor(
    private prisma: PrismaService,
    private journalService: JournalService,
    private posStaffService: PosStaffService,
    private notifications: NotificationsService,
    private loyalty: LoyaltyService,
  ) {}

  // One walk-in checkout: validates stock per line, deducts it, snapshots cost price for COGS,
  // and posts two journal entries — revenue (Dr Cash/Bank/AR, Cr Sales Revenue) and COGS
  // (Dr COGS, Cr Inventory, skipped if no product in the cart has a cost price set yet).
  async create(dto: CreatePosSaleDto) {
    const session = await this.prisma.posSession.findUnique({ where: { id: dto.sessionId } });
    if (!session) throw new NotFoundException(`Session ${dto.sessionId} not found`);
    if (session.status !== 'OPEN') throw new BadRequestException(`Session ${dto.sessionId} is not open`);

    const paymentMethod = await this.prisma.paymentMethod.findUnique({ where: { id: dto.paymentMethodId } });
    if (!paymentMethod) throw new NotFoundException(`Payment method ${dto.paymentMethodId} not found`);

    if (dto.items.length === 0) throw new BadRequestException('A sale needs at least one item');

    const products = await this.prisma.product.findMany({ where: { id: { in: dto.items.map((i) => i.productId) } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestException(`Product ${item.productId} not found`);
      subtotal += item.quantity * product.price;
    }

    const discountAmount = Math.min(Math.max(dto.discountAmount || 0, 0), subtotal);
    const totalAmount = subtotal - discountAmount;

    let clientName = dto.clientName;
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (customer) clientName = customer.name;
    }

    const servedById = await this.posStaffService.resolveStaffToken(dto.servedByToken);
    const loyaltyConfig = await this.loyalty.getConfig();
    const pointsEarned = dto.customerId ? this.loyalty.computePointsEarned(loyaltyConfig, totalAmount) : 0;

    const stockDecrements: { productId: number; name: string; quantity: number }[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.create({
        data: {
          sessionId: dto.sessionId,
          warehouseId: session.warehouseId,
          paymentMethodId: dto.paymentMethodId,
          servedById,
          clientName,
          customerId: dto.customerId,
          totalAmount,
          discountAmount,
        },
      });
      await tx.posSale.update({ where: { id: sale.id }, data: { invoiceNumber: `POS-${String(sale.id).padStart(6, '0')}` } });

      if (dto.customerId && pointsEarned > 0) {
        await tx.loyaltyTransaction.create({
          data: { customerId: dto.customerId, points: pointsEarned, type: 'EARN', sourceType: 'POS_SALE', sourceId: sale.id },
        });
      }

      let totalCost = 0;
      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        const isService = product.type === 'SERVICE';
        const batchNumber = isService ? 'SERVICE' : item.batchNumber;
        if (!isService && !batchNumber) {
          throw new BadRequestException(`Batch number is required for Product #${item.productId}`);
        }

        let unitCost = product.costPrice;
        if (!isService) {
          // Cost lookup only — the actual sufficiency guard is the conditional updateMany below.
          // Prefers the batch's own landed cost over Product.costPrice, same reasoning as valuation.
          const inv = await tx.inventory.findUnique({
            where: {
              productId_warehouseId_batchNumber: {
                productId: item.productId,
                warehouseId: session.warehouseId,
                batchNumber: batchNumber!,
              },
            },
          });
          unitCost = inv && inv.unitCost > 0 ? inv.unitCost : product.costPrice;

          // Conditional update (not read-then-write) — the WHERE clause's quantity >= X check and
          // the decrement happen as one atomic statement, so two concurrent checkouts against the
          // same low-stock batch can't both pass a separate pre-check and drive quantity negative.
          const deducted = await tx.inventory.updateMany({
            where: {
              productId: item.productId,
              warehouseId: session.warehouseId,
              batchNumber: batchNumber!,
              quantity: { gte: item.quantity },
            },
            data: { quantity: { decrement: item.quantity } },
          });
          if (deducted.count === 0) {
            throw new BadRequestException(`Insufficient stock for Product #${item.productId} (Batch: ${batchNumber}).`);
          }
          stockDecrements.push({ productId: item.productId, name: product.name, quantity: item.quantity });
        }
        totalCost += item.quantity * unitCost;

        await tx.posSaleItem.create({
          data: {
            posSaleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            price: product.price,
            costPrice: unitCost,
            batchNumber,
          },
        });
      }

      if (totalAmount > 0) {
        const revenueAccountId = await this.journalService.getMappedAccountId(tx, AccountMappingRole.SALES_REVENUE);
        if (paymentMethod.type === 'ACCOUNT_RECEIVABLE') {
          const arAccountId = await this.journalService.getMappedAccountId(tx, AccountMappingRole.ACCOUNTS_RECEIVABLE);
          await this.journalService.postEntry(tx, {
            sourceType: 'POS_SALE',
            sourceId: sale.id,
            memo: `POS sale #${sale.id}`,
            lines: [
              { accountId: arAccountId, debit: totalAmount, partyType: 'CUSTOMER', partyName: dto.clientName || 'Walk-in' },
              { accountId: revenueAccountId, credit: totalAmount },
            ],
          });
        } else {
          const cashAccountId = await this.journalService.resolveJournalAccount(tx, paymentMethod.journalId, 'debit', AccountMappingRole.CASH_BANK);
          await this.journalService.postEntry(tx, {
            sourceType: 'POS_SALE',
            sourceId: sale.id,
            journalId: paymentMethod.journalId ?? undefined,
            memo: `POS sale #${sale.id}`,
            lines: [
              { accountId: cashAccountId, debit: totalAmount },
              { accountId: revenueAccountId, credit: totalAmount },
            ],
          });
        }
      }

      // COGS only posts once cost prices are actually set — a 0-cost cart means "not tracked yet".
      if (totalCost > 0) {
        const [cogsAccountId, inventoryAccountId] = await Promise.all([
          this.journalService.getMappedAccountId(tx, AccountMappingRole.COGS),
          this.journalService.getMappedAccountId(tx, AccountMappingRole.INVENTORY),
        ]);
        await this.journalService.postEntry(tx, {
          sourceType: 'POS_SALE_COGS',
          sourceId: sale.id,
          memo: `COGS for POS sale #${sale.id}`,
          lines: [
            { accountId: cogsAccountId, debit: totalCost },
            { accountId: inventoryAccountId, credit: totalCost },
          ],
        });
      }

      return tx.posSale.findUnique({ where: { id: sale.id }, include: DETAIL_INCLUDE });
    }, { timeout: 15000 });

    this.checkLowStockAfterDecrements(stockDecrements).catch(() => {});
    return result;
  }

  // Runs after the transaction commits — see the equivalent method in DeliveriesService for why
  // "before" is reconstructed from "after + quantity" rather than read inside the transaction.
  private async checkLowStockAfterDecrements(decrements: { productId: number; name: string; quantity: number }[]) {
    for (const dec of decrements) {
      const totals = await this.prisma.inventory.aggregate({
        where: { productId: dec.productId },
        _sum: { quantity: true },
      });
      const after = totals._sum.quantity ?? 0;
      await this.notifications.notifyLowStockIfCrossed({ id: dec.productId, name: dec.name }, after + dec.quantity, after);
    }
  }

  async findAll(sessionId?: number) {
    return this.prisma.posSale.findMany({
      where: sessionId ? { sessionId } : undefined,
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Z-report style summary: totals/discount/transaction count overall and broken down by
  // payment method, for a date range and optional warehouse — cancelled sales are excluded
  // from every total (they're reversed, not part of the day's real takings).
  async getReport(filters?: { from?: string; to?: string; warehouseId?: number }) {
    const where: any = { cancelledAt: null };
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (filters?.from) dateFilter.gte = new Date(filters.from);
    if (filters?.to) dateFilter.lte = new Date(filters.to + 'T23:59:59.999Z');
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const sales = await this.prisma.posSale.findMany({
      where,
      include: { paymentMethod: true, items: { include: { product: true } } },
    });

    const byMethod = new Map<string, { paymentMethodId: number; name: string; count: number; total: number }>();
    const byProduct = new Map<number, { productId: number; name: string; quantity: number; total: number }>();
    let totalSales = 0;
    let totalDiscount = 0;
    for (const sale of sales) {
      totalSales += sale.totalAmount;
      totalDiscount += sale.discountAmount;
      const key = String(sale.paymentMethodId);
      const existing = byMethod.get(key) || { paymentMethodId: sale.paymentMethodId, name: sale.paymentMethod.name, count: 0, total: 0 };
      existing.count += 1;
      existing.total += sale.totalAmount;
      byMethod.set(key, existing);

      for (const item of sale.items) {
        const productEntry = byProduct.get(item.productId) || { productId: item.productId, name: item.product.name, quantity: 0, total: 0 };
        productEntry.quantity += item.quantity;
        productEntry.total += item.quantity * item.price;
        byProduct.set(item.productId, productEntry);
      }
    }

    const cancelledCount = await this.prisma.posSale.count({
      where: { ...where, cancelledAt: { not: null } },
    });

    return {
      transactionCount: sales.length,
      totalSales,
      totalDiscount,
      cancelledCount,
      byPaymentMethod: Array.from(byMethod.values()).sort((a, b) => b.total - a.total),
      byProduct: Array.from(byProduct.values()).sort((a, b) => b.total - a.total),
    };
  }

  async findOne(id: number) {
    const sale = await this.prisma.posSale.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!sale) throw new NotFoundException(`POS sale ${id} not found`);
    return sale;
  }

  // Restocks the deducted inventory and reverses the GL postings, then writes the audit-only
  // PosCancelledSale log — all in ONE transaction. The `updateMany` claim below is what makes
  // this safe against two concurrent cancel requests: only one can flip cancelledAt from null,
  // the other sees count===0 and bails out before touching stock or the ledger at all — and
  // because everything (restock + GL reversal) now shares one transaction, a crash partway
  // through rolls back cleanly instead of leaving stock restocked but the GL unreversed (or
  // vice versa) with no way to retry, since cancelledAt would already be set.
  async cancel(id: number, reason?: string, cancelledByToken?: string) {
    const sale = await this.prisma.posSale.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
    if (!sale) throw new NotFoundException(`POS sale ${id} not found`);
    if (sale.cancelledAt) throw new BadRequestException(`POS sale ${id} is already cancelled`);

    const cancelledById = await this.posStaffService.resolveStaffToken(cancelledByToken);

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.posSale.updateMany({
        where: { id: sale.id, cancelledAt: null },
        data: { cancelledAt: new Date() },
      });
      if (claimed.count === 0) throw new BadRequestException(`POS sale ${id} is already cancelled`);

      for (const item of sale.items) {
        // Service-type items never had stock deducted at sale time — nothing to restock,
        // and no Inventory row exists for the 'SERVICE' sentinel batch to update.
        if (item.product.type === 'SERVICE') continue;
        await tx.inventory.update({
          where: {
            productId_warehouseId_batchNumber: {
              productId: item.productId,
              warehouseId: sale.warehouseId,
              batchNumber: item.batchNumber,
            },
          },
          data: { quantity: { increment: item.quantity } },
        });
      }

      await tx.posCancelledSale.create({
        data: {
          originalSaleId: sale.id,
          itemsSummary: sale.items.map((i) => ({ productId: i.productId, name: i.product.name, quantity: i.quantity, price: i.price })),
          totalAmount: sale.totalAmount,
          reason,
          cancelledById,
        },
      });

      const entries = await tx.journalEntry.findMany({
        where: { sourceType: { in: ['POS_SALE', 'POS_SALE_COGS'] }, sourceId: sale.id, voidedAt: null, reversalOfId: null },
      });
      for (const entry of entries) {
        await this.journalService.voidEntryInTx(tx, entry.id, reason || `POS sale #${sale.id} cancelled`);
      }

      return tx.posSale.findUnique({ where: { id: sale.id }, include: DETAIL_INCLUDE });
    }, { timeout: 15000 });
  }
}

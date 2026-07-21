import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';
import { CreatePosSaleDto } from './dto/create-pos-sale.dto';

const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  paymentMethod: true,
  servedBy: { select: { id: true, name: true } },
  session: { include: { warehouse: true } },
};

@Injectable()
export class PosSalesService {
  constructor(
    private prisma: PrismaService,
    private journalService: JournalService,
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

    let totalAmount = 0;
    let totalCost = 0;
    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestException(`Product ${item.productId} not found`);
      totalAmount += item.quantity * product.price;
      totalCost += item.quantity * product.costPrice;
    }

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.create({
        data: {
          sessionId: dto.sessionId,
          warehouseId: session.warehouseId,
          paymentMethodId: dto.paymentMethodId,
          servedById: dto.servedById,
          clientName: dto.clientName,
          totalAmount,
        },
      });
      await tx.posSale.update({ where: { id: sale.id }, data: { invoiceNumber: `POS-${String(sale.id).padStart(6, '0')}` } });

      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;

        const currentStock = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_batchNumber: {
              productId: item.productId,
              warehouseId: session.warehouseId,
              batchNumber: item.batchNumber,
            },
          },
        });
        if (!currentStock || currentStock.quantity < item.quantity) {
          throw new BadRequestException(`Insufficient stock for Product #${item.productId} (Batch: ${item.batchNumber}).`);
        }
        await tx.inventory.update({
          where: {
            productId_warehouseId_batchNumber: {
              productId: item.productId,
              warehouseId: session.warehouseId,
              batchNumber: item.batchNumber,
            },
          },
          data: { quantity: { decrement: item.quantity } },
        });

        await tx.posSaleItem.create({
          data: {
            posSaleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            price: product.price,
            costPrice: product.costPrice,
            batchNumber: item.batchNumber,
          },
        });
      }

      if (totalAmount > 0) {
        const revenueAccountId = await this.journalService.getAccountIdByCode(tx, '4000');
        if (paymentMethod.type === 'ACCOUNT_RECEIVABLE') {
          const arAccountId = await this.journalService.getAccountIdByCode(tx, '1100');
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
          const cashAccountId = await this.journalService.resolveJournalAccount(tx, paymentMethod.journalId, 'debit', '1000');
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
          this.journalService.getAccountIdByCode(tx, '5000'),
          this.journalService.getAccountIdByCode(tx, '1200'),
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
  }

  async findAll(sessionId?: number) {
    return this.prisma.posSale.findMany({
      where: sessionId ? { sessionId } : undefined,
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const sale = await this.prisma.posSale.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!sale) throw new NotFoundException(`POS sale ${id} not found`);
    return sale;
  }

  // Audit-only — does not restock or reverse the GL postings, matches the reference behavior.
  async cancel(id: number, reason?: string, cancelledById?: number) {
    const sale = await this.prisma.posSale.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
    if (!sale) throw new NotFoundException(`POS sale ${id} not found`);

    return this.prisma.posCancelledSale.create({
      data: {
        originalSaleId: sale.id,
        itemsSummary: sale.items.map((i) => ({ productId: i.productId, name: i.product.name, quantity: i.quantity, price: i.price })),
        totalAmount: sale.totalAmount,
        reason,
        cancelledById,
      },
    });
  }
}

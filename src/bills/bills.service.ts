import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { RecordBillPaymentDto } from './dto/record-bill-payment.dto';

const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  payments: { orderBy: { paidAt: 'desc' as const } },
  purchaseOrder: { include: { warehouse: true, supplier: true } },
};

@Injectable()
export class BillsService {
  constructor(
    private prisma: PrismaService,
    private journalService: JournalService,
  ) {}

  // Billing policy is "against ordered quantity" — independent of receipt progress, so a
  // Purchase Order can be billed for any subset of what was ordered (not gated by what's received).
  async create(dto: CreateBillDto) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.purchaseOrderId },
      include: { items: true, supplier: true },
    });
    if (!po) throw new NotFoundException(`Purchase Order ${dto.purchaseOrderId} not found`);
    if (po.status !== 'ORDERED' && po.status !== 'RECEIVED') {
      throw new BadRequestException(`Purchase Order ${dto.purchaseOrderId} must be ORDERED before it can be billed (status: ${po.status})`);
    }

    let totalAmount = 0;
    for (const reqItem of dto.items) {
      const poItem = po.items.find((i) => i.id === reqItem.purchaseOrderItemId);
      if (!poItem) {
        throw new BadRequestException(`Item ${reqItem.purchaseOrderItemId} is not part of Purchase Order #${dto.purchaseOrderId}`);
      }
      const remaining = poItem.quantityOrdered - poItem.quantityBilled;
      if (reqItem.quantity > remaining) {
        throw new BadRequestException(`Cannot bill ${reqItem.quantity} for item ${reqItem.purchaseOrderItemId}; only ${remaining} remaining`);
      }
      totalAmount += reqItem.quantity * (reqItem.unitCost ?? poItem.unitCost);
    }

    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.bill.create({
        data: { purchaseOrderId: dto.purchaseOrderId, totalAmount },
      });
      await tx.bill.update({
        where: { id: bill.id },
        data: { billNumber: `BILL-${String(bill.id).padStart(6, '0')}` },
      });

      for (const reqItem of dto.items) {
        const poItem = po.items.find((i) => i.id === reqItem.purchaseOrderItemId)!;
        await tx.billItem.create({
          data: {
            billId: bill.id,
            purchaseOrderItemId: poItem.id,
            productId: poItem.productId,
            quantity: reqItem.quantity,
            unitCost: reqItem.unitCost ?? poItem.unitCost,
          },
        });
        // Guard is the WHERE clause (current DB value vs. a precomputed threshold), not the
        // pre-transaction `remaining` check above — two concurrent bills against the same PO
        // item can't both pass that check and jointly over-bill past the ordered quantity.
        const claimed = await tx.purchaseOrderItem.updateMany({
          where: { id: poItem.id, quantityBilled: { lte: poItem.quantityOrdered - reqItem.quantity } },
          data: { quantityBilled: { increment: reqItem.quantity } },
        });
        if (claimed.count === 0) {
          throw new BadRequestException(`Cannot bill ${reqItem.quantity} for item ${poItem.id}; exceeds ordered quantity`);
        }
      }

      // 💰 Auto-post: Dr Stock Interim (Received) / Cr Accounts Payable — converts the
      // accrued-but-unbilled liability into a real, billed one owed to the supplier.
      if (totalAmount > 0) {
        const [stockInterimAccountId, apAccountId] = await Promise.all([
          this.journalService.getMappedAccountId(tx, AccountMappingRole.STOCK_INTERIM),
          this.journalService.getMappedAccountId(tx, AccountMappingRole.ACCOUNTS_PAYABLE),
        ]);
        await this.journalService.postEntry(tx, {
          sourceType: 'PURCHASE_INVOICE',
          sourceId: bill.id,
          memo: `Bill for PO #${dto.purchaseOrderId}`,
          lines: [
            { accountId: stockInterimAccountId, debit: totalAmount },
            { accountId: apAccountId, credit: totalAmount, partyType: 'SUPPLIER', partyName: po.supplier.name },
          ],
        });
      }

      return tx.bill.findUnique({ where: { id: bill.id }, include: DETAIL_INCLUDE });
    }, { timeout: 15000 });
  }

  async findAll(purchaseOrderId?: number) {
    return this.prisma.bill.findMany({
      where: purchaseOrderId ? { purchaseOrderId } : undefined,
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const bill = await this.prisma.bill.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!bill) throw new NotFoundException(`Bill ${id} not found`);
    return bill;
  }

  async recordPayment(billId: number, dto: RecordBillPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.bill.findUnique({ where: { id: billId }, include: { purchaseOrder: { include: { supplier: true } } } });
      if (!bill) throw new NotFoundException(`Bill ${billId} not found`);

      const { _sum: existingSum } = await tx.purchasePayment.aggregate({ where: { billId }, _sum: { amount: true } });
      const currentPaid = existingSum.amount || 0;
      if (currentPaid + dto.amount > bill.totalAmount + 0.01) {
        throw new BadRequestException(
          `Payment of ${dto.amount} would exceed the outstanding balance of ${(bill.totalAmount - currentPaid).toFixed(2)}`,
        );
      }

      await tx.purchasePayment.create({
        data: { billId, amount: dto.amount, method: dto.method, journalId: dto.journalId },
      });

      // 💰 Auto-post: Dr Accounts Payable / Cr Cash/Bank (journal-resolved).
      const [apAccountId, cashAccountId] = await Promise.all([
        this.journalService.getMappedAccountId(tx, AccountMappingRole.ACCOUNTS_PAYABLE),
        this.journalService.resolveJournalAccount(tx, dto.journalId, 'credit', AccountMappingRole.CASH_BANK),
      ]);
      await this.journalService.postEntry(tx, {
        sourceType: 'PURCHASE_PAYMENT',
        sourceId: billId,
        journalId: dto.journalId,
        memo: `Payment made for Bill #${billId}`,
        lines: [
          { accountId: apAccountId, debit: dto.amount, partyType: 'SUPPLIER', partyName: bill.purchaseOrder.supplier.name },
          { accountId: cashAccountId, credit: dto.amount },
        ],
      });

      const { _sum } = await tx.purchasePayment.aggregate({ where: { billId }, _sum: { amount: true } });
      const amountPaid = _sum.amount || 0;
      const paymentStatus = amountPaid <= 0 ? 'UNPAID' : amountPaid >= bill.totalAmount ? 'PAID' : 'PARTIAL';

      return tx.bill.update({
        where: { id: billId },
        data: { amountPaid, paymentStatus },
        include: DETAIL_INCLUDE,
      });
    });
  }
}

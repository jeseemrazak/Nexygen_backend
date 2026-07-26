import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  payments: { orderBy: { receivedAt: 'desc' as const } },
  salesOrder: { include: { warehouse: true, user: { select: { name: true, email: true } } } },
};

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private journalService: JournalService,
  ) {}

  // Invoicing policy is "against ordered quantity" — independent of delivery progress, so a
  // Sales Order can be billed for any subset of what was ordered (not gated by what's shipped).
  async create(dto: CreateInvoiceDto) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: dto.salesOrderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException(`Sales Order ${dto.salesOrderId} not found`);
    if (order.status !== 'CONFIRMED' && order.status !== 'DONE') {
      throw new BadRequestException(`Sales Order ${dto.salesOrderId} must be CONFIRMED before it can be invoiced (status: ${order.status})`);
    }

    let totalAmount = 0;
    for (const reqItem of dto.items) {
      const soItem = order.items.find((i) => i.id === reqItem.salesOrderItemId);
      if (!soItem) {
        throw new BadRequestException(`Item ${reqItem.salesOrderItemId} is not part of Sales Order #${dto.salesOrderId}`);
      }
      const remaining = soItem.quantity - soItem.quantityInvoiced;
      if (reqItem.quantity > remaining) {
        throw new BadRequestException(`Cannot invoice ${reqItem.quantity} for item ${reqItem.salesOrderItemId}; only ${remaining} remaining`);
      }
      totalAmount += reqItem.quantity * soItem.price;
    }

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: { salesOrderId: dto.salesOrderId, totalAmount },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { invoiceNumber: `INV-${String(invoice.id).padStart(6, '0')}` },
      });

      for (const reqItem of dto.items) {
        const soItem = order.items.find((i) => i.id === reqItem.salesOrderItemId)!;
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            salesOrderItemId: soItem.id,
            productId: soItem.productId,
            quantity: reqItem.quantity,
            price: soItem.price,
          },
        });
        // Guard is the WHERE clause (current DB value vs. a precomputed threshold), not the
        // pre-transaction `remaining` check above — two concurrent invoices against the same
        // order item can't both pass that check and jointly over-invoice past the ordered quantity.
        const claimed = await tx.salesOrderItem.updateMany({
          where: { id: soItem.id, quantityInvoiced: { lte: soItem.quantity - reqItem.quantity } },
          data: { quantityInvoiced: { increment: reqItem.quantity } },
        });
        if (claimed.count === 0) {
          throw new BadRequestException(`Cannot invoice ${reqItem.quantity} for item ${soItem.id}; exceeds ordered quantity`);
        }
      }

      if (totalAmount > 0) {
        const [arAccountId, revenueAccountId] = await Promise.all([
          this.journalService.getMappedAccountId(tx, AccountMappingRole.ACCOUNTS_RECEIVABLE),
          this.journalService.getMappedAccountId(tx, AccountMappingRole.SALES_REVENUE),
        ]);
        await this.journalService.postEntry(tx, {
          sourceType: 'SALES_INVOICE',
          sourceId: invoice.id,
          memo: `Sales invoice for Order #${dto.salesOrderId}`,
          lines: [
            { accountId: arAccountId, debit: totalAmount, partyType: 'CUSTOMER', partyName: order.clientName || 'Walk-in' },
            { accountId: revenueAccountId, credit: totalAmount },
          ],
        });
      }

      return tx.invoice.findUnique({ where: { id: invoice.id }, include: DETAIL_INCLUDE });
    }, { timeout: 15000 });
  }

  async findAll(salesOrderId?: number) {
    return this.prisma.invoice.findMany({
      where: salesOrderId ? { salesOrderId } : undefined,
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    return invoice;
  }

  async recordPayment(invoiceId: number, dto: RecordPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { salesOrder: true } });
      if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

      const { _sum: existingSum } = await tx.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } });
      const currentPaid = existingSum.amount || 0;
      if (currentPaid + dto.amount > invoice.totalAmount + 0.01) {
        throw new BadRequestException(
          `Payment of ${dto.amount} would exceed the outstanding balance of ${(invoice.totalAmount - currentPaid).toFixed(2)}`,
        );
      }

      await tx.payment.create({ data: { invoiceId, amount: dto.amount, method: dto.method, journalId: dto.journalId } });

      const [cashAccountId, arAccountId] = await Promise.all([
        this.journalService.resolveJournalAccount(tx, dto.journalId, 'debit', AccountMappingRole.CASH_BANK),
        this.journalService.getMappedAccountId(tx, AccountMappingRole.ACCOUNTS_RECEIVABLE),
      ]);
      await this.journalService.postEntry(tx, {
        sourceType: 'SALES_PAYMENT',
        sourceId: invoiceId,
        journalId: dto.journalId,
        memo: `Payment received for Invoice #${invoiceId}`,
        lines: [
          { accountId: cashAccountId, debit: dto.amount },
          { accountId: arAccountId, credit: dto.amount, partyType: 'CUSTOMER', partyName: invoice.salesOrder.clientName || 'Walk-in' },
        ],
      });

      const { _sum } = await tx.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } });
      const amountPaid = _sum.amount || 0;
      const paymentStatus = amountPaid <= 0 ? 'UNPAID' : amountPaid >= invoice.totalAmount ? 'PAID' : 'PARTIAL';

      return tx.invoice.update({
        where: { id: invoiceId },
        data: { amountPaid, paymentStatus },
        include: DETAIL_INCLUDE,
      });
    });
  }
}

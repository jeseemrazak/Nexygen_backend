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
  currency: true,
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
      include: { items: true, customer: true },
    });
    if (!order) throw new NotFoundException(`Sales Order ${dto.salesOrderId} not found`);
    if (order.status !== 'CONFIRMED' && order.status !== 'DONE') {
      throw new BadRequestException(`Sales Order ${dto.salesOrderId} must be CONFIRMED before it can be invoiced (status: ${order.status})`);
    }

    let subtotal = 0;
    for (const reqItem of dto.items) {
      const soItem = order.items.find((i) => i.id === reqItem.salesOrderItemId);
      if (!soItem) {
        throw new BadRequestException(`Item ${reqItem.salesOrderItemId} is not part of Sales Order #${dto.salesOrderId}`);
      }
      const remaining = soItem.quantity - soItem.quantityInvoiced;
      if (reqItem.quantity > remaining) {
        throw new BadRequestException(`Cannot invoice ${reqItem.quantity} for item ${reqItem.salesOrderItemId}; only ${remaining} remaining`);
      }
      subtotal += reqItem.quantity * soItem.price;
    }

    return this.prisma.$transaction(async (tx) => {
      let taxAmount = 0;
      if (dto.taxId) {
        const tax = await tx.tax.findUnique({ where: { id: dto.taxId } });
        if (!tax) throw new BadRequestException(`Tax ${dto.taxId} not found`);
        taxAmount = Math.round(subtotal * (tax.rate / 100) * 100) / 100;
      }
      const totalAmount = subtotal + taxAmount;

      // Falls back to the customer's own default terms if none was given explicitly — dueDate is
      // a frozen snapshot computed now, never recalculated if the term is edited later.
      const effectiveTermId = dto.paymentTermId ?? order.customer?.paymentTermId ?? undefined;
      let dueDate: Date | undefined;
      if (effectiveTermId) {
        const term = await tx.paymentTerm.findUnique({ where: { id: effectiveTermId } });
        if (!term) throw new BadRequestException(`Payment term ${effectiveTermId} not found`);
        dueDate = new Date(Date.now() + term.days * 86400000);
      }

      // Foreign-currency quote, frozen at creation time — a pure informational overlay on top of
      // the real QAR totalAmount above (see the schema comment on Invoice.currencyId).
      let currencyFields: { currencyId?: number; exchangeRate?: number; foreignTotalAmount?: number } = {};
      if (dto.currencyId) {
        const currency = await tx.currency.findUnique({ where: { id: dto.currencyId } });
        if (!currency) throw new BadRequestException(`Currency ${dto.currencyId} not found`);
        currencyFields = {
          currencyId: currency.id,
          exchangeRate: currency.exchangeRateToBase,
          foreignTotalAmount: Math.round((totalAmount / currency.exchangeRateToBase) * 100) / 100,
        };
      }

      const invoice = await tx.invoice.create({
        data: { salesOrderId: dto.salesOrderId, subtotal, taxId: dto.taxId, taxAmount, costCenterId: dto.costCenterId, totalAmount, paymentTermId: effectiveTermId, dueDate, ...currencyFields },
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
        const [arAccountId, revenueAccountId, taxPayableAccountId] = await Promise.all([
          this.journalService.getMappedAccountId(tx, AccountMappingRole.ACCOUNTS_RECEIVABLE),
          this.journalService.getMappedAccountId(tx, AccountMappingRole.SALES_REVENUE),
          taxAmount > 0 ? this.journalService.getMappedAccountId(tx, AccountMappingRole.TAX_PAYABLE) : Promise.resolve(null),
        ]);
        const lines: { accountId: number; debit?: number; credit?: number; partyType?: 'CUSTOMER'; partyName?: string; warehouseId?: number; costCenterId?: number }[] = [
          { accountId: arAccountId, debit: totalAmount, partyType: 'CUSTOMER', partyName: order.clientName || 'Walk-in', warehouseId: order.warehouseId },
          { accountId: revenueAccountId, credit: subtotal, warehouseId: order.warehouseId, costCenterId: dto.costCenterId },
        ];
        if (taxAmount > 0) lines.push({ accountId: taxPayableAccountId!, credit: taxAmount, warehouseId: order.warehouseId });
        await this.journalService.postEntry(tx, {
          sourceType: 'SALES_INVOICE',
          sourceId: invoice.id,
          memo: `Sales invoice for Order #${dto.salesOrderId}`,
          lines,
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

  async cancel(id: number, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id }, include: { items: true } });
      if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
      if (invoice.cancelledAt) throw new BadRequestException(`Invoice ${id} is already cancelled`);
      if (invoice.amountPaid > 0) {
        throw new BadRequestException(`Cannot cancel Invoice ${id} — it has payments recorded against it; reverse the payments first`);
      }

      const entries = await tx.journalEntry.findMany({
        where: { sourceType: { in: ['SALES_INVOICE', 'SALES_PAYMENT'] }, sourceId: id, voidedAt: null, reversalOfId: null },
      });
      for (const entry of entries) {
        await this.journalService.voidEntryInTx(tx, entry.id, reason);
      }

      for (const item of invoice.items) {
        await tx.salesOrderItem.update({
          where: { id: item.salesOrderItemId },
          data: { quantityInvoiced: { decrement: item.quantity } },
        });
      }

      return tx.invoice.update({
        where: { id },
        data: { cancelledAt: new Date() },
        include: DETAIL_INCLUDE,
      });
    }, { timeout: 15000 });
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

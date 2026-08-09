import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';
import { CreatePartyPaymentDto } from './dto/create-party-payment.dto';

@Injectable()
export class PartyPaymentsService {
  constructor(
    private prisma: PrismaService,
    private journalService: JournalService,
  ) {}

  // Every unpaid/partially-paid Sales Invoice, optionally for one customer.
  async getOpenInvoices(customerName?: string) {
    return this.prisma.invoice.findMany({
      where: {
        invoiceNumber: { not: null },
        paymentStatus: { not: 'PAID' },
        ...(customerName && { salesOrder: { clientName: customerName } }),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Every unpaid/partially-paid Bill, optionally for one supplier.
  async getOpenBills(supplierName?: string) {
    return this.prisma.bill.findMany({
      where: {
        paymentStatus: { not: 'PAID' },
        ...(supplierName && { purchaseOrder: { supplier: { name: supplierName } } }),
      },
      include: { purchaseOrder: { include: { supplier: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Every POS sale tendered (in whole or part) on account for one customer, with whatever's
  // already been settled against it netted out. Direct analogue of getOpenInvoices(), reused
  // by both the customer balance figure and the settle-credit dialog's document picker.
  async getOpenAccountSales(customerId: number) {
    const sales = await this.prisma.posSale.findMany({
      where: {
        customerId,
        cancelledAt: null,
        payments: { some: { paymentMethod: { type: 'ACCOUNT_RECEIVABLE' } } },
      },
      include: {
        payments: { include: { paymentMethod: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const results = await Promise.all(
      sales.map(async (sale) => {
        // Split-tender sales may only put part of the total on account — only that portion is
        // ever debited to AR (see PosSalesService.createInTx), so only that portion is owed here.
        const arAmount = sale.payments
          .filter((p: any) => p.paymentMethod.type === 'ACCOUNT_RECEIVABLE')
          .reduce((s: number, p: any) => s + p.amount, 0);

        const settled = await this.prisma.partyPaymentAllocation.aggregate({
          where: { sourceType: 'POS_SALE', sourceId: sale.id },
          _sum: { amountAllocated: true },
        });
        const outstanding = arAmount - (settled._sum.amountAllocated || 0);

        return {
          id: sale.id,
          invoiceNumber: sale.invoiceNumber,
          createdAt: sale.createdAt,
          totalAmount: sale.totalAmount,
          arAmount,
          outstanding,
        };
      }),
    );

    return results.filter((r) => r.outstanding > 0.01);
  }

  async getCustomerBalance(customerId: number) {
    const openSales = await this.getOpenAccountSales(customerId);
    return { balance: openSales.reduce((s, r) => s + r.outstanding, 0) };
  }

  // Unifies all three payment paths in this app into one list: the generic multi-document
  // PartyPayment (this module's own `create()`), plus the direct single-document payments
  // recorded straight from an Invoice or Bill's detail page (Payment/PurchasePayment) — those
  // never touch PartyPayment, so without this merge they'd silently never show up here even
  // though they post to the GL correctly.
  async findAll() {
    const [partyPayments, invoicePayments, billPayments] = await Promise.all([
      this.prisma.partyPayment.findMany({ include: { allocations: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.payment.findMany({ include: { invoice: { include: { salesOrder: true } } }, orderBy: { receivedAt: 'desc' } }),
      this.prisma.purchasePayment.findMany({ include: { bill: { include: { purchaseOrder: { include: { supplier: true } } } } }, orderBy: { paidAt: 'desc' } }),
    ]);

    const unified = [
      ...partyPayments.map((p) => ({
        id: p.id,
        source: 'PARTY' as const,
        paymentNumber: p.paymentNumber,
        partyType: p.partyType,
        partyName: p.partyName,
        amount: p.amount,
        method: p.method,
        createdAt: p.createdAt,
        documentCount: p.allocations.length,
      })),
      ...invoicePayments.map((p) => ({
        id: p.id,
        source: 'SALES_INVOICE' as const,
        paymentNumber: `INV-PAY-${String(p.id).padStart(6, '0')}`,
        partyType: 'CUSTOMER' as const,
        partyName: p.invoice.salesOrder?.clientName || 'Walk-in',
        amount: p.amount,
        method: p.method,
        createdAt: p.receivedAt,
        documentCount: 1,
        invoiceId: p.invoiceId,
      })),
      ...billPayments.map((p) => ({
        id: p.id,
        source: 'PURCHASE_BILL' as const,
        paymentNumber: `BILL-PAY-${String(p.id).padStart(6, '0')}`,
        partyType: 'SUPPLIER' as const,
        partyName: p.bill.purchaseOrder.supplier.name,
        amount: p.amount,
        method: p.method,
        createdAt: p.paidAt,
        documentCount: 1,
        billId: p.billId,
      })),
    ];

    return unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // `source` disambiguates which of the three payment tables `id` refers to — ids are not
  // unique across PartyPayment/Payment/PurchasePayment, only within each table.
  async findOne(id: number, source: string) {
    if (source === 'SALES_INVOICE') {
      const payment = await this.prisma.payment.findUnique({
        where: { id },
        include: { invoice: { include: { salesOrder: true } }, journal: true },
      });
      if (!payment) throw new NotFoundException(`Payment ${id} not found`);
      return {
        id: payment.id,
        source: 'SALES_INVOICE' as const,
        paymentNumber: `INV-PAY-${String(payment.id).padStart(6, '0')}`,
        partyType: 'CUSTOMER' as const,
        partyName: payment.invoice.salesOrder?.clientName || 'Walk-in',
        amount: payment.amount,
        method: payment.method,
        createdAt: payment.receivedAt,
        journalName: payment.journal?.name || null,
        notes: null,
        allocations: [{
          sourceType: 'SALES_INVOICE',
          sourceId: payment.invoiceId,
          documentNumber: payment.invoice.invoiceNumber,
          amountAllocated: payment.amount,
        }],
      };
    }

    if (source === 'PURCHASE_BILL') {
      const payment = await this.prisma.purchasePayment.findUnique({
        where: { id },
        include: { bill: { include: { purchaseOrder: { include: { supplier: true } } } }, journal: true },
      });
      if (!payment) throw new NotFoundException(`Payment ${id} not found`);
      return {
        id: payment.id,
        source: 'PURCHASE_BILL' as const,
        paymentNumber: `BILL-PAY-${String(payment.id).padStart(6, '0')}`,
        partyType: 'SUPPLIER' as const,
        partyName: payment.bill.purchaseOrder.supplier.name,
        amount: payment.amount,
        method: payment.method,
        createdAt: payment.paidAt,
        journalName: payment.journal?.name || null,
        notes: null,
        allocations: [{
          sourceType: 'PURCHASE_BILL',
          sourceId: payment.billId,
          documentNumber: payment.bill.billNumber,
          amountAllocated: payment.amount,
        }],
      };
    }

    const payment = await this.prisma.partyPayment.findUnique({
      where: { id },
      include: { allocations: true, journal: true },
    });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);

    const allocations = await Promise.all(
      payment.allocations.map(async (a) => {
        const documentNumber = a.sourceType === 'SALES_INVOICE'
          ? (await this.prisma.invoice.findUnique({ where: { id: a.sourceId } }))?.invoiceNumber
          : (await this.prisma.bill.findUnique({ where: { id: a.sourceId } }))?.billNumber;
        return { sourceType: a.sourceType, sourceId: a.sourceId, documentNumber: documentNumber || null, amountAllocated: a.amountAllocated };
      }),
    );

    return {
      id: payment.id,
      source: 'PARTY' as const,
      paymentNumber: payment.paymentNumber,
      partyType: payment.partyType,
      partyName: payment.partyName,
      amount: payment.amount,
      method: payment.method,
      createdAt: payment.createdAt,
      journalName: payment.journal?.name || null,
      notes: payment.notes,
      allocations,
    };
  }

  // Atomic: payment row + allocations + amountPaid/status bump on each source doc + the
  // balanced Cash/Bank vs AR/AP journal entry, all in one transaction — mirrors the pattern
  // already used by InvoicesService.recordPayment / BillsService.recordPayment, just
  // spread across however many documents the caller chose to allocate this payment across.
  async create(dto: CreatePartyPaymentDto) {
    const allocatedTotal = dto.allocations.reduce((s, a) => s + a.amountAllocated, 0);
    if (Math.abs(allocatedTotal - dto.amount) > 0.01) {
      throw new BadRequestException(`Allocations (${allocatedTotal}) must add up to the payment amount (${dto.amount})`);
    }

    return this.prisma.$transaction(async (tx) => {
      // paymentNumber starts null (not a placeholder string) so a concurrent create can never
      // collide on the unique constraint before either row gets its real, id-based number.
      const payment = await tx.partyPayment.create({
        data: {
          partyType: dto.partyType,
          partyName: dto.partyName,
          amount: dto.amount,
          method: dto.method,
          journalId: dto.journalId,
          notes: dto.notes,
        },
      });
      await tx.partyPayment.update({
        where: { id: payment.id },
        data: { paymentNumber: `PAY-${String(payment.id).padStart(6, '0')}` },
      });

      for (const alloc of dto.allocations) {
        if (alloc.sourceType === 'SALES_INVOICE') {
          const invoice = await tx.invoice.findUnique({ where: { id: alloc.sourceId } });
          if (!invoice) throw new BadRequestException(`Invoice ${alloc.sourceId} not found`);
          const newPaid = Math.min(Math.max(invoice.amountPaid + alloc.amountAllocated, 0), invoice.totalAmount);
          const status = newPaid >= invoice.totalAmount ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
          await tx.invoice.update({ where: { id: alloc.sourceId }, data: { amountPaid: newPaid, paymentStatus: status } });
        } else if (alloc.sourceType === 'POS_SALE') {
          // PosSale has no amountPaid/paymentStatus columns — "settled" is derived on read
          // (getOpenAccountSales sums PartyPaymentAllocation rows), so settling a POS sale on
          // account only needs the allocation row itself, no update to the sale.
          const sale = await tx.posSale.findUnique({ where: { id: alloc.sourceId } });
          if (!sale) throw new BadRequestException(`POS sale ${alloc.sourceId} not found`);
        } else {
          const bill = await tx.bill.findUnique({ where: { id: alloc.sourceId } });
          if (!bill) throw new BadRequestException(`Bill ${alloc.sourceId} not found`);
          const newPaid = Math.min(Math.max(bill.amountPaid + alloc.amountAllocated, 0), bill.totalAmount);
          const status = newPaid >= bill.totalAmount ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
          await tx.bill.update({ where: { id: alloc.sourceId }, data: { amountPaid: newPaid, paymentStatus: status } });
        }

        await tx.partyPaymentAllocation.create({
          data: {
            partyPaymentId: payment.id,
            sourceType: alloc.sourceType,
            sourceId: alloc.sourceId,
            amountAllocated: alloc.amountAllocated,
          },
        });
      }

      if (dto.partyType === 'CUSTOMER') {
        const [cashAccountId, arAccountId] = await Promise.all([
          this.journalService.resolveJournalAccount(tx, dto.journalId, 'debit', AccountMappingRole.CASH_BANK),
          this.journalService.getMappedAccountId(tx, AccountMappingRole.ACCOUNTS_RECEIVABLE),
        ]);
        await this.journalService.postEntry(tx, {
          sourceType: 'PARTY_PAYMENT',
          sourceId: payment.id,
          journalId: dto.journalId,
          memo: `Payment ${payment.id} received from ${dto.partyName}`,
          lines: [
            { accountId: cashAccountId, debit: dto.amount },
            { accountId: arAccountId, credit: dto.amount, partyType: 'CUSTOMER', partyName: dto.partyName },
          ],
        });
      } else {
        const [apAccountId, cashAccountId] = await Promise.all([
          this.journalService.getMappedAccountId(tx, AccountMappingRole.ACCOUNTS_PAYABLE),
          this.journalService.resolveJournalAccount(tx, dto.journalId, 'credit', AccountMappingRole.CASH_BANK),
        ]);
        await this.journalService.postEntry(tx, {
          sourceType: 'PARTY_PAYMENT',
          sourceId: payment.id,
          journalId: dto.journalId,
          memo: `Payment ${payment.id} made to ${dto.partyName}`,
          lines: [
            { accountId: apAccountId, debit: dto.amount, partyType: 'SUPPLIER', partyName: dto.partyName },
            { accountId: cashAccountId, credit: dto.amount },
          ],
        });
      }

      return tx.partyPayment.findUnique({ where: { id: payment.id }, include: { allocations: true } });
    }, { timeout: 15000 });
  }
}

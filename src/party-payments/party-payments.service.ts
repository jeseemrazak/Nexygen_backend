import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  async findAll() {
    return this.prisma.partyPayment.findMany({
      include: { allocations: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const payment = await this.prisma.partyPayment.findUnique({ where: { id }, include: { allocations: true } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
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
          this.journalService.resolveJournalAccount(tx, dto.journalId, 'debit', '1000'),
          this.journalService.getAccountIdByCode(tx, '1100'),
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
          this.journalService.getAccountIdByCode(tx, '2000'),
          this.journalService.resolveJournalAccount(tx, dto.journalId, 'credit', '1000'),
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

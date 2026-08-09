import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function bucketFor(daysOverdue: number): 'current' | '31-60' | '61-90' | '90+' {
  if (daysOverdue <= 30) return 'current';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

function emptyTotals() {
  return { current: 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
}

@Injectable()
export class AgingService {
  constructor(private prisma: PrismaService) {}

  // Which customers/shops owe us money, and how overdue — sourced directly from Invoice
  // fields (not the journal) since that's the authoritative record of what's outstanding.
  async getArAging(asOf?: string) {
    const asOfDate = asOf ? new Date(asOf + 'T23:59:59.999Z') : new Date();

    const invoices = await this.prisma.invoice.findMany({
      where: { invoiceNumber: { not: null }, paymentStatus: { not: 'PAID' }, createdAt: { lte: asOfDate } },
      include: { salesOrder: { select: { clientName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const rows = invoices.map((inv) => {
      const outstanding = inv.totalAmount - inv.amountPaid;
      // Falls back to createdAt for invoices posted before Payment Terms existed — dueDate is
      // the real "when is this actually late" line once a term was resolved onto the invoice.
      const dueDate = inv.dueDate ?? inv.createdAt;
      const daysOverdue = Math.floor((asOfDate.getTime() - dueDate.getTime()) / 86400000);
      return {
        orderId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.salesOrder.clientName || 'Walk-in',
        invoiceDate: inv.createdAt,
        dueDate,
        totalAmount: inv.totalAmount,
        amountPaid: inv.amountPaid,
        outstanding,
        daysOverdue,
        bucket: bucketFor(daysOverdue),
      };
    }).filter((r) => r.outstanding > 0.001);

    const totals = emptyTotals();
    for (const r of rows) {
      totals[r.bucket] += r.outstanding;
      totals.total += r.outstanding;
    }

    return { asOf: asOfDate, rows, totals };
  }

  // Which suppliers we owe money to, and how overdue — sourced from Bill (the purchase-side
  // billing document; a PurchaseOrder can have several Bills for partial billing).
  async getApAging(asOf?: string) {
    const asOfDate = asOf ? new Date(asOf + 'T23:59:59.999Z') : new Date();

    const bills = await this.prisma.bill.findMany({
      where: { paymentStatus: { not: 'PAID' }, createdAt: { lte: asOfDate } },
      include: { purchaseOrder: { include: { supplier: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const rows = bills.map((bill) => {
      const outstanding = bill.totalAmount - bill.amountPaid;
      const dueDate = bill.dueDate ?? bill.createdAt;
      const daysOverdue = Math.floor((asOfDate.getTime() - dueDate.getTime()) / 86400000);
      return {
        purchaseOrderId: bill.purchaseOrderId,
        invoiceNumber: bill.billNumber,
        supplierName: bill.purchaseOrder.supplier.name,
        invoiceDate: bill.createdAt,
        dueDate,
        totalAmount: bill.totalAmount,
        amountPaid: bill.amountPaid,
        outstanding,
        daysOverdue,
        bucket: bucketFor(daysOverdue),
      };
    }).filter((r) => r.outstanding > 0.001);

    const totals = emptyTotals();
    for (const r of rows) {
      totals[r.bucket] += r.outstanding;
      totals.total += r.outstanding;
    }

    return { asOf: asOfDate, rows, totals };
  }
}

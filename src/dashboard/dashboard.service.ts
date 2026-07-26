import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveDateRange } from '../common/date-range.util';

// Turns a Prisma groupBy count result into a plain { STATUS: count } map, filling in every
// known status with 0 so the dashboard cards never have to guard against a missing key.
function toStatusMap<T extends string>(
  rows: { status: T; _count: { status: number } }[],
  allStatuses: readonly T[],
): Record<T, number> {
  const map = Object.fromEntries(allStatuses.map((s) => [s, 0])) as Record<T, number>;
  for (const row of rows) map[row.status] = row._count.status;
  return map;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // One card's worth of data per document type: total count + a breakdown by status. Receipts
  // have no status field (an immutable goods-receipt event), so it's total-only.
  async getDocumentStatusSummary(query?: { range?: string; startDate?: string; endDate?: string }) {
    const dateFilter = resolveDateRange(query);
    const createdAtWhere = dateFilter ? { createdAt: dateFilter } : {};

    const [quotationGroups, salesOrderGroups, invoiceGroups, purchaseOrderGroups, billGroups, receiptCount] =
      await Promise.all([
        this.prisma.quotation.groupBy({ by: ['status'], _count: { status: true }, where: createdAtWhere }),
        this.prisma.salesOrder.groupBy({ by: ['status'], _count: { status: true }, where: createdAtWhere }),
        this.prisma.invoice.groupBy({ by: ['paymentStatus'], _count: { paymentStatus: true }, where: createdAtWhere }),
        this.prisma.purchaseOrder.groupBy({ by: ['status'], _count: { status: true }, where: createdAtWhere }),
        this.prisma.bill.groupBy({ by: ['paymentStatus'], _count: { paymentStatus: true }, where: createdAtWhere }),
        this.prisma.receipt.count({ where: createdAtWhere }),
      ]);

    const quotationsByStatus = toStatusMap(quotationGroups, ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED'] as const);
    const salesOrdersByStatus = toStatusMap(salesOrderGroups, ['DRAFT', 'CONFIRMED', 'DONE', 'CANCELLED'] as const);
    const purchaseOrdersByStatus = toStatusMap(purchaseOrderGroups, ['DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED'] as const);

    const invoicesByStatus = Object.fromEntries(
      (['UNPAID', 'PARTIAL', 'PAID'] as const).map((s) => [
        s,
        invoiceGroups.find((g) => g.paymentStatus === s)?._count.paymentStatus ?? 0,
      ]),
    ) as Record<'UNPAID' | 'PARTIAL' | 'PAID', number>;

    const billsByStatus = Object.fromEntries(
      (['UNPAID', 'PARTIAL', 'PAID'] as const).map((s) => [
        s,
        billGroups.find((g) => g.paymentStatus === s)?._count.paymentStatus ?? 0,
      ]),
    ) as Record<'UNPAID' | 'PARTIAL' | 'PAID', number>;

    const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

    return {
      quotations: { total: sum(quotationsByStatus), byStatus: quotationsByStatus },
      salesOrders: { total: sum(salesOrdersByStatus), byStatus: salesOrdersByStatus },
      invoices: { total: sum(invoicesByStatus), byStatus: invoicesByStatus },
      purchaseOrders: { total: sum(purchaseOrdersByStatus), byStatus: purchaseOrdersByStatus },
      receipts: { total: receiptCount },
      bills: { total: sum(billsByStatus), byStatus: billsByStatus },
    };
  }
}

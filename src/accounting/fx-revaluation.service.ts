import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FxRevaluationService {
  constructor(private prisma: PrismaService) {}

  // Report-only (never posts anything) — for every still-open Invoice/Bill quoted in a foreign
  // currency, recomputes what its outstanding balance would be worth in QAR at today's live
  // Currency.exchangeRateToBase vs. the rate it was frozen at when created, and surfaces the
  // difference as an unrealized gain/loss. The foreign-currency outstanding amount is always
  // derived as (outstanding QAR / the document's own frozen rate) — valid regardless of how much
  // has been paid, since every payment in this app is itself recorded in QAR.
  async getFxRevaluation() {
    const [invoices, bills] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { currencyId: { not: null }, paymentStatus: { not: 'PAID' }, cancelledAt: null },
        include: { currency: true, salesOrder: { select: { clientName: true } } },
      }),
      this.prisma.bill.findMany({
        where: { currencyId: { not: null }, paymentStatus: { not: 'PAID' }, cancelledAt: null },
        include: { currency: true, purchaseOrder: { include: { supplier: true } } },
      }),
    ]);

    // AR: if the foreign currency strengthened since invoicing (revaluedQAR > outstandingQAR),
    // the QAR value of what's owed to us went up — that's a gain.
    const invoiceRows = invoices.map((inv) => {
      const outstanding = inv.totalAmount - inv.amountPaid;
      const foreignOutstanding = outstanding / inv.exchangeRate!;
      const revaluedQAR = Math.round(foreignOutstanding * inv.currency!.exchangeRateToBase * 100) / 100;
      return {
        type: 'AR' as const,
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        party: inv.salesOrder.clientName || 'Walk-in',
        currency: inv.currency,
        originalRate: inv.exchangeRate!,
        currentRate: inv.currency!.exchangeRateToBase,
        foreignOutstanding,
        outstandingQAR: outstanding,
        revaluedQAR,
        gainLoss: revaluedQAR - outstanding,
      };
    });

    // AP: if the foreign currency strengthened, we now owe MORE QAR — that's a loss, so the sign
    // is flipped relative to AR.
    const billRows = bills.map((bill) => {
      const outstanding = bill.totalAmount - bill.amountPaid;
      const foreignOutstanding = outstanding / bill.exchangeRate!;
      const revaluedQAR = Math.round(foreignOutstanding * bill.currency!.exchangeRateToBase * 100) / 100;
      return {
        type: 'AP' as const,
        documentId: bill.id,
        documentNumber: bill.billNumber,
        party: bill.purchaseOrder.supplier.name,
        currency: bill.currency,
        originalRate: bill.exchangeRate!,
        currentRate: bill.currency!.exchangeRateToBase,
        foreignOutstanding,
        outstandingQAR: outstanding,
        revaluedQAR,
        gainLoss: outstanding - revaluedQAR,
      };
    });

    const rows = [...invoiceRows, ...billRows];
    const totalGain = rows.filter((r) => r.gainLoss > 0).reduce((s, r) => s + r.gainLoss, 0);
    const totalLoss = rows.filter((r) => r.gainLoss < 0).reduce((s, r) => s + r.gainLoss, 0);

    return { rows, totalGain, totalLoss, netGainLoss: totalGain + totalLoss };
  }
}

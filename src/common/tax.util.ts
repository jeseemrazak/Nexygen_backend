import { BadRequestException } from '@nestjs/common';

// Looks up a Tax by id and returns its amount on `base`, rounded to the cent — shared by every
// document that merely displays an estimated tax (no GL posting). The three documents that DO
// post GL (POS sale, Invoice, Bill) inline this same arithmetic themselves since they need the
// resolved Tax row for that transaction's tx client, not just the amount.
export async function computeTaxAmount(prisma: any, taxId: number | undefined | null, base: number): Promise<number> {
  if (!taxId) return 0;
  const tax = await prisma.tax.findUnique({ where: { id: taxId } });
  if (!tax) throw new BadRequestException(`Tax ${taxId} not found`);
  return Math.round(base * (tax.rate / 100) * 100) / 100;
}

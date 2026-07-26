export type DiscountType = 'PERCENT' | 'AMOUNT';

// Used for both a line's listPrice -> net price and a document's subtotal -> totalAmount —
// same arithmetic either way, so it lives in one place instead of being duplicated per service.
export function applyDiscount(base: number, type?: DiscountType | null, value?: number | null): number {
  if (!type || !value) return base;
  const discount = type === 'PERCENT' ? base * (value / 100) : value;
  return Math.max(0, base - discount);
}

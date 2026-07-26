-- POS completeness pass: customer linkage, discount tracking, and a real cancel (restock + GL
-- reversal) marker. Purely additive: new nullable/defaulted columns + one FK. No data migration.

ALTER TABLE "PosSale" ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PosSale" ADD COLUMN "customerId" INTEGER;
ALTER TABLE "PosSale" ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

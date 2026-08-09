CREATE TABLE "Currency" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "exchangeRateToBase" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

ALTER TABLE "Invoice" ADD COLUMN "currencyId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "Invoice" ADD COLUMN "foreignTotalAmount" DOUBLE PRECISION;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_currencyId_fkey"
  FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Bill" ADD COLUMN "currencyId" INTEGER;
ALTER TABLE "Bill" ADD COLUMN "exchangeRate" DOUBLE PRECISION;
ALTER TABLE "Bill" ADD COLUMN "foreignTotalAmount" DOUBLE PRECISION;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_currencyId_fkey"
  FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

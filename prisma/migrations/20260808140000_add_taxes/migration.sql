-- Taxes: a selectable flat-rate Tax master, applied on top of (subtotal - discount) on every
-- sales/purchase document, plus the two new GL roles it posts through.

-- CreateTable
CREATE TABLE "Tax" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);

-- AlterTable: SalesOrder
ALTER TABLE "SalesOrder" ADD COLUMN "taxId" INTEGER;
ALTER TABLE "SalesOrder" ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Quotation
ALTER TABLE "Quotation" ADD COLUMN "taxId" INTEGER;
ALTER TABLE "Quotation" ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Invoice
ALTER TABLE "Invoice" ADD COLUMN "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "taxId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Backfill: every existing invoice's pre-tax subtotal equals its current total (no tax existed before).
UPDATE "Invoice" SET "subtotal" = "totalAmount";

-- AlterTable: PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN "taxId" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Bill
ALTER TABLE "Bill" ADD COLUMN "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Bill" ADD COLUMN "taxId" INTEGER;
ALTER TABLE "Bill" ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "Bill" SET "subtotal" = "totalAmount";

-- AlterTable: PosSale
ALTER TABLE "PosSale" ADD COLUMN "taxId" INTEGER;
ALTER TABLE "PosSale" ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PosSale" ADD CONSTRAINT "PosSale_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- New GL posting roles
ALTER TYPE "AccountMappingRole" ADD VALUE IF NOT EXISTS 'TAX_PAYABLE';
ALTER TYPE "AccountMappingRole" ADD VALUE IF NOT EXISTS 'TAX_RECEIVABLE';

-- Seed the two GL accounts (if they don't already exist)
INSERT INTO "Account" (code, name, type, "isActive", "createdAt", "updatedAt")
SELECT '2240', 'Tax Payable (Output)', 'LIABILITY', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Account" WHERE code = '2240');

INSERT INTO "Account" (code, name, type, "isActive", "createdAt", "updatedAt")
SELECT '1350', 'Tax Receivable (Input)', 'ASSET', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Account" WHERE code = '1350');

-- Map them
INSERT INTO "AccountMapping" ("role", "accountId", "updatedAt")
SELECT 'TAX_PAYABLE', (SELECT id FROM "Account" WHERE code = '2240'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AccountMapping" WHERE role = 'TAX_PAYABLE');

INSERT INTO "AccountMapping" ("role", "accountId", "updatedAt")
SELECT 'TAX_RECEIVABLE', (SELECT id FROM "Account" WHERE code = '1350'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AccountMapping" WHERE role = 'TAX_RECEIVABLE');

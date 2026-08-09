-- Payment Terms (Net 30 etc. on Customer/Supplier, resolved onto Invoice/Bill.dueDate),
-- Fiscal Years (period locking for journal posting), and Cost Centers (a reporting tag on
-- JournalLine).

-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'LOCKED');

-- CreateTable
CREATE TABLE "PaymentTerm" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FiscalYear_name_key" ON "FiscalYear"("name");

-- AlterTable: Supplier
ALTER TABLE "Supplier" ADD COLUMN "paymentTermId" INTEGER;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Customer
ALTER TABLE "Customer" ADD COLUMN "paymentTermId" INTEGER;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Invoice
ALTER TABLE "Invoice" ADD COLUMN "paymentTermId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Bill
ALTER TABLE "Bill" ADD COLUMN "paymentTermId" INTEGER;
ALTER TABLE "Bill" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: JournalLine
ALTER TABLE "JournalLine" ADD COLUMN "costCenterId" INTEGER;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

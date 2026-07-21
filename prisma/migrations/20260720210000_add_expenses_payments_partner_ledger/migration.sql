-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'REJECTED');

-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'PARTY_PAYMENT';
ALTER TYPE "JournalSourceType" ADD VALUE 'EXPENSE_APPROVAL';
ALTER TYPE "JournalSourceType" ADD VALUE 'EXPENSE_PAYMENT';

-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN     "partyName" TEXT,
ADD COLUMN     "partyType" "PartyType";

-- CreateTable
CREATE TABLE "PartyPayment" (
    "id" SERIAL NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "partyType" "PartyType" NOT NULL,
    "partyName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyPaymentAllocation" (
    "id" SERIAL NOT NULL,
    "partyPaymentId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "amountAllocated" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PartyPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "expenseNumber" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "payeeName" TEXT NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartyPayment_paymentNumber_key" ON "PartyPayment"("paymentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_expenseNumber_key" ON "Expense"("expenseNumber");

-- AddForeignKey
ALTER TABLE "PartyPaymentAllocation" ADD CONSTRAINT "PartyPaymentAllocation_partyPaymentId_fkey" FOREIGN KEY ("partyPaymentId") REFERENCES "PartyPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

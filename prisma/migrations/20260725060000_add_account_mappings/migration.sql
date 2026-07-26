-- CreateEnum
CREATE TYPE "AccountMappingRole" AS ENUM (
  'CASH_BANK',
  'ACCOUNTS_RECEIVABLE',
  'ACCOUNTS_PAYABLE',
  'INVENTORY',
  'STOCK_INTERIM',
  'COGS',
  'INVENTORY_ADJUSTMENT',
  'SALES_REVENUE',
  'EXPENSES_PAYABLE',
  'SALARY_EXPENSE',
  'GRSIA_EMPLOYER_EXPENSE',
  'GRSIA_PAYABLE',
  'EMPLOYEE_ADVANCES_RECEIVABLE',
  'SALARY_PAYABLE',
  'EOS_GRATUITY_EXPENSE',
  'EOS_GRATUITY_ACCRUAL'
);

-- CreateTable
CREATE TABLE "AccountMapping" (
    "id" SERIAL NOT NULL,
    "role" "AccountMappingRole" NOT NULL,
    "accountId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountMapping_role_key" ON "AccountMapping"("role");

-- AddForeignKey
ALTER TABLE "AccountMapping" ADD CONSTRAINT "AccountMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

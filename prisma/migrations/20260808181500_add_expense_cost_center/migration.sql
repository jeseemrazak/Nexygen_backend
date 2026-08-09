ALTER TABLE "Expense" ADD COLUMN "costCenterId" INTEGER;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_costCenterId_fkey"
  FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

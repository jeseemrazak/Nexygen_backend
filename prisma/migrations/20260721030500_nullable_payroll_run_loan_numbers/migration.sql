-- Nullable then filled right after create (id-based) — matches PartyPayment.paymentNumber /
-- Expense.expenseNumber, avoids a unique-constraint race under concurrent creates.
ALTER TABLE "PayrollRun" ALTER COLUMN "runNo" DROP NOT NULL;
ALTER TABLE "EmployeeLoan" ALTER COLUMN "loanNo" DROP NOT NULL;

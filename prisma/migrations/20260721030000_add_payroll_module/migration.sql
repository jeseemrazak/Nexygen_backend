-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'PROCESSED', 'PAID');

-- CreateEnum
CREATE TYPE "EmployeeLoanStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- AlterEnum (adds new source types for payroll GL postings)
ALTER TYPE "JournalSourceType" ADD VALUE 'PAYROLL_RUN';
ALTER TYPE "JournalSourceType" ADD VALUE 'PAYROLL_DISBURSEMENT';
ALTER TYPE "JournalSourceType" ADD VALUE 'LOAN_ISSUANCE';
ALTER TYPE "JournalSourceType" ADD VALUE 'EOS_ACCRUAL';

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isQatari" BOOLEAN NOT NULL DEFAULT false,
    "qidNumber" TEXT,
    "qidExpiryDate" TIMESTAMP(3),
    "passportNumber" TEXT,
    "passportExpiryDate" TIMESTAMP(3),
    "visaExpiryDate" TIMESTAMP(3),
    "bankName" TEXT,
    "iban" TEXT,
    "basicSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "housingAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transportationAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "telephoneAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payrollActive" BOOLEAN NOT NULL DEFAULT true,
    "hireDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollConfig" (
    "id" SERIAL NOT NULL,
    "grsiaEmployeePercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "grsiaEmployerPercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "workingDaysPerMonth" DOUBLE PRECISION NOT NULL DEFAULT 26,
    "workingHoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "overtimeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "nightOvertimeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "eosWeeksPerYear" DOUBLE PRECISION NOT NULL DEFAULT 3,

    CONSTRAINT "PayrollConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" SERIAL NOT NULL,
    "runNo" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "totalGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "journalEntryId" INTEGER,
    "paymentJournalEntryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" SERIAL NOT NULL,
    "payrollRunId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "basicSalary" DOUBLE PRECISION NOT NULL,
    "allowancesTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowancesBreakdown" JSONB NOT NULL,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nightOvertimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unpaidLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unpaidLeaveDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grsiaEmployeeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grsiaEmployerAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loanDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isQatari" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLoan" (
    "id" SERIAL NOT NULL,
    "loanNo" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "principalAmount" DOUBLE PRECISION NOT NULL,
    "monthlyDeduction" DOUBLE PRECISION NOT NULL,
    "outstandingBalance" DOUBLE PRECISION NOT NULL,
    "status" "EmployeeLoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "journalEntryId" INTEGER,
    "dateIssued" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLoanRepayment" (
    "id" SERIAL NOT NULL,
    "employeeLoanId" INTEGER NOT NULL,
    "payslipId" INTEGER,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeLoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EosAccrualLog" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "amountPosted" DOUBLE PRECISION NOT NULL,
    "journalEntryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EosAccrualLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_runNo_key" ON "PayrollRun"("runNo");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeLoan_loanNo_key" ON "EmployeeLoan"("loanNo");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoanRepayment" ADD CONSTRAINT "EmployeeLoanRepayment_employeeLoanId_fkey" FOREIGN KEY ("employeeLoanId") REFERENCES "EmployeeLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoanRepayment" ADD CONSTRAINT "EmployeeLoanRepayment_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EosAccrualLog" ADD CONSTRAINT "EosAccrualLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

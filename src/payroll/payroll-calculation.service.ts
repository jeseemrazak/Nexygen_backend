import { Injectable } from '@nestjs/common';

export interface PayrollConfigInput {
  grsiaEmployeePercent: number;
  grsiaEmployerPercent: number;
  workingDaysPerMonth: number;
  workingHoursPerDay: number;
  overtimeMultiplier: number;
  nightOvertimeMultiplier: number;
  eosWeeksPerYear: number;
}

export interface EmployeeCalcInput {
  isQatari: boolean;
  basicSalary: number;
  housingAllowance: number;
  transportationAllowance: number;
  telephoneAllowance: number;
  otherAllowance: number;
  overtimeHours: number;
  nightOvertimeHours: number;
  unpaidLeaveDays: number;
  loanDeduction: number;
  otherDeductions: number;
}

export interface PayslipCalcResult {
  allowancesTotal: number;
  allowancesBreakdown: { housing: number; transportation: number; telephone: number; other: number };
  overtimeAmount: number;
  unpaidLeaveDeduction: number;
  grossPay: number;
  grsiaEmployeeAmount: number;
  grsiaEmployerAmount: number;
  totalDeductions: number;
  netPay: number;
}

// Pure, side-effect-free — ported from NEXYGEN ERP's payroll-calculation.service.ts. Every
// figure here composes into the GL postings in payroll-posting.service.ts, so the two must
// stay consistent: grossPay = basic+allowances+overtime; totalDeductions = unpaid-leave +
// GRSIA(employee share) + loan + other; netPay = grossPay - totalDeductions.
@Injectable()
export class PayrollCalculationService {
  calculatePayslip(employee: EmployeeCalcInput, config: PayrollConfigInput): PayslipCalcResult {
    const allowancesBreakdown = {
      housing: employee.housingAllowance,
      transportation: employee.transportationAllowance,
      telephone: employee.telephoneAllowance,
      other: employee.otherAllowance,
    };
    const allowancesTotal = employee.housingAllowance + employee.transportationAllowance + employee.telephoneAllowance + employee.otherAllowance;

    const hourlyRate = employee.basicSalary / (config.workingDaysPerMonth * config.workingHoursPerDay);
    const overtimeAmount =
      employee.overtimeHours * hourlyRate * config.overtimeMultiplier +
      employee.nightOvertimeHours * hourlyRate * config.nightOvertimeMultiplier;

    const dailyRate = (employee.basicSalary + allowancesTotal) / config.workingDaysPerMonth;
    const unpaidLeaveDeduction = employee.unpaidLeaveDays * dailyRate;

    const grossPay = employee.basicSalary + allowancesTotal + overtimeAmount;

    // GRSIA (Qatar General Retirement & Social Insurance Authority) — Qatari nationals only.
    const grsiaBase = employee.basicSalary + allowancesTotal;
    const grsiaEmployeeAmount = employee.isQatari ? grsiaBase * (config.grsiaEmployeePercent / 100) : 0;
    const grsiaEmployerAmount = employee.isQatari ? grsiaBase * (config.grsiaEmployerPercent / 100) : 0;

    const totalDeductions = unpaidLeaveDeduction + grsiaEmployeeAmount + employee.loanDeduction + employee.otherDeductions;
    const netPay = grossPay - totalDeductions;

    return {
      allowancesTotal,
      allowancesBreakdown,
      overtimeAmount,
      unpaidLeaveDeduction,
      grossPay,
      grsiaEmployeeAmount,
      grsiaEmployerAmount,
      totalDeductions,
      netPay,
    };
  }

  // End of Service gratuity — Qatar Labour Law No. 14/2004. Non-Qatari employees only, vests
  // at 365 days of service. Never stored as a running balance: this always computes the FULL
  // accrual owed to date from the formula; the caller diffs it against EosAccrualLog's
  // sum-to-date to find the incremental amount still to post.
  calculateEosGratuityAccrued(basicSalary: number, hireDate: Date, asOf: Date, eosWeeksPerYear: number): number {
    const daysOfService = (asOf.getTime() - hireDate.getTime()) / 86400000;
    if (daysOfService < 365) return 0;

    const weeklyWage = (basicSalary * 12) / 52;
    return weeklyWage * eosWeeksPerYear * (daysOfService / 365.25);
  }
}

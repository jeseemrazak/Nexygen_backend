import { Injectable } from '@nestjs/common';
import { JournalService } from '../accounting/journal.service';

@Injectable()
export class PayrollPostingService {
  constructor(private journalService: JournalService) {}

  // One entry per run, through the PAYROLL journal:
  //   Dr 5200 Salary Expense   Σ(basic+allowances+overtime-unpaidLeave-otherDeductions)
  //   Dr 5210 GRSIA Employer Expense   Σ grsiaEmployerAmount
  //   Cr 2210 GRSIA Payable   Σ(grsiaEmployeeAmount+grsiaEmployerAmount)
  //   Cr 1300 Employee Advances Receivable   Σ loanDeduction (loan recovery)
  //   Cr 2200 Salary Payable   Σ netPay
  async postPayrollRun(tx: any, runId: number, payslips: any[]) {
    const payrollJournal = await tx.journal.findUnique({ where: { code: 'PAYROLL' } });

    const salaryExpense = payslips.reduce((s, p) => s + p.basicSalary + p.allowancesTotal + p.overtimeAmount - p.unpaidLeaveDeduction - p.otherDeductions, 0);
    const grsiaEmployerTotal = payslips.reduce((s, p) => s + p.grsiaEmployerAmount, 0);
    const grsiaPayableTotal = payslips.reduce((s, p) => s + p.grsiaEmployeeAmount + p.grsiaEmployerAmount, 0);
    const loanRecoveryTotal = payslips.reduce((s, p) => s + p.loanDeduction, 0);
    const salaryPayableTotal = payslips.reduce((s, p) => s + p.netPay, 0);

    const [salaryExpenseId, grsiaExpenseId, grsiaPayableId, advancesId, salaryPayableId] = await Promise.all([
      this.journalService.getAccountIdByCode(tx, '5200'),
      this.journalService.getAccountIdByCode(tx, '5210'),
      this.journalService.getAccountIdByCode(tx, '2210'),
      this.journalService.getAccountIdByCode(tx, '1300'),
      this.journalService.getAccountIdByCode(tx, '2200'),
    ]);

    const lines: { accountId: number; debit?: number; credit?: number }[] = [
      { accountId: salaryExpenseId, debit: salaryExpense },
    ];
    if (grsiaEmployerTotal > 0.001) lines.push({ accountId: grsiaExpenseId, debit: grsiaEmployerTotal });
    if (grsiaPayableTotal > 0.001) lines.push({ accountId: grsiaPayableId, credit: grsiaPayableTotal });
    if (loanRecoveryTotal > 0.001) lines.push({ accountId: advancesId, credit: loanRecoveryTotal });
    lines.push({ accountId: salaryPayableId, credit: salaryPayableTotal });

    return this.journalService.postEntry(tx, {
      sourceType: 'PAYROLL_RUN',
      sourceId: runId,
      journalId: payrollJournal?.id,
      memo: `Payroll run #${runId}`,
      lines,
    });
  }

  // Dr Salary Payable / Cr the chosen Cash-or-Bank journal.
  async postPayrollDisbursement(tx: any, runId: number, amount: number, journalId?: number) {
    const [salaryPayableId, cashAccountId] = await Promise.all([
      this.journalService.getAccountIdByCode(tx, '2200'),
      this.journalService.resolveJournalAccount(tx, journalId, 'credit', '1000'),
    ]);
    return this.journalService.postEntry(tx, {
      sourceType: 'PAYROLL_DISBURSEMENT',
      sourceId: runId,
      journalId,
      memo: `Salary disbursement for run #${runId}`,
      lines: [
        { accountId: salaryPayableId, debit: amount },
        { accountId: cashAccountId, credit: amount },
      ],
    });
  }

  // Dr Employee Advances Receivable / Cr the chosen Cash-or-Bank journal.
  async postLoanIssuance(tx: any, loanId: number, amount: number, journalId?: number) {
    const [advancesId, cashAccountId] = await Promise.all([
      this.journalService.getAccountIdByCode(tx, '1300'),
      this.journalService.resolveJournalAccount(tx, journalId, 'credit', '1000'),
    ]);
    return this.journalService.postEntry(tx, {
      sourceType: 'LOAN_ISSUANCE',
      sourceId: loanId,
      journalId,
      memo: `Loan #${loanId} issued`,
      lines: [
        { accountId: advancesId, debit: amount },
        { accountId: cashAccountId, credit: amount },
      ],
    });
  }

  // Manual repayment outside payroll — Dr chosen Cash-or-Bank journal / Cr Employee Advances Receivable.
  async postLoanRepayment(tx: any, loanId: number, amount: number, journalId?: number) {
    const [cashAccountId, advancesId] = await Promise.all([
      this.journalService.resolveJournalAccount(tx, journalId, 'debit', '1000'),
      this.journalService.getAccountIdByCode(tx, '1300'),
    ]);
    return this.journalService.postEntry(tx, {
      sourceType: 'LOAN_ISSUANCE',
      sourceId: loanId,
      journalId,
      memo: `Manual repayment for loan #${loanId}`,
      lines: [
        { accountId: cashAccountId, debit: amount },
        { accountId: advancesId, credit: amount },
      ],
    });
  }

  // Dr EOS Gratuity Expense / Cr EOS Gratuity Accrual — one summed entry across every
  // employee's incremental accrual for this posting run, through the PAYROLL journal.
  async postEosAccrual(tx: any, totalAmount: number) {
    const payrollJournal = await tx.journal.findUnique({ where: { code: 'PAYROLL' } });
    const [expenseId, accrualId] = await Promise.all([
      this.journalService.getAccountIdByCode(tx, '5220'),
      this.journalService.getAccountIdByCode(tx, '2220'),
    ]);
    return this.journalService.postEntry(tx, {
      sourceType: 'EOS_ACCRUAL',
      journalId: payrollJournal?.id,
      memo: 'Monthly EOS gratuity accrual',
      lines: [
        { accountId: expenseId, debit: totalAmount },
        { accountId: accrualId, credit: totalAmount },
      ],
    });
  }
}

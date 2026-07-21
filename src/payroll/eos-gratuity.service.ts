import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollConfigService } from './payroll-config.service';
import { PayrollPostingService } from './payroll-posting.service';

@Injectable()
export class EosGratuityService {
  constructor(
    private prisma: PrismaService,
    private calc: PayrollCalculationService,
    private configService: PayrollConfigService,
    private posting: PayrollPostingService,
  ) {}

  // Live report — accrued-to-date is always recomputed from the formula, never read from a
  // stored balance. Non-Qatari, payroll-active employees only (Qatari employees don't accrue
  // EOS gratuity under this scheme — they have GRSIA instead).
  private async computeIncrements(asOf: Date) {
    const config = await this.configService.get();
    const employees = await this.prisma.employee.findMany({
      where: { isQatari: false, payrollActive: true },
      include: { eosAccrualLogs: true },
    });

    return employees.map((employee) => {
      const accruedToDate = this.calc.calculateEosGratuityAccrued(employee.basicSalary, employee.hireDate, asOf, config.eosWeeksPerYear);
      const alreadyPosted = employee.eosAccrualLogs.reduce((s, l) => s + l.amountPosted, 0);
      const pendingIncrement = Math.max(accruedToDate - alreadyPosted, 0);
      const daysOfService = Math.floor((asOf.getTime() - employee.hireDate.getTime()) / 86400000);

      return {
        employeeId: employee.id,
        name: employee.name,
        hireDate: employee.hireDate,
        daysOfService,
        accruedToDate,
        alreadyPosted,
        pendingIncrement,
      };
    });
  }

  async report(asOf?: string) {
    const asOfDate = asOf ? new Date(asOf) : new Date();
    return this.computeIncrements(asOfDate);
  }

  async previewIncrements(asOf?: string) {
    const rows = await this.report(asOf);
    return rows.filter((r) => r.pendingIncrement > 0.005);
  }

  // Posts one summed entry (Dr 5220 EOS Expense / Cr 2220 EOS Accrual) across every employee's
  // pending increment, and logs each employee's individual increment for future diffing.
  async postAccrual() {
    const asOfDate = new Date();
    const increments = (await this.computeIncrements(asOfDate)).filter((r) => r.pendingIncrement > 0.005);
    if (increments.length === 0) return { posted: false, message: 'No pending EOS accrual to post.' };

    const totalAmount = increments.reduce((s, r) => s + r.pendingIncrement, 0);

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.posting.postEosAccrual(tx, totalAmount);

      for (const inc of increments) {
        await tx.eosAccrualLog.create({
          data: { employeeId: inc.employeeId, amountPosted: inc.pendingIncrement, journalEntryId: entry.id },
        });
      }

      return { posted: true, totalAmount, employeeCount: increments.length, journalEntryId: entry.id };
    }, { timeout: 15000 });
  }
}

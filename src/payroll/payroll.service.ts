import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollConfigService } from './payroll-config.service';
import { PayrollPostingService } from './payroll-posting.service';
import { GenerateRunDto } from './dto/generate-run.dto';
import { UpdatePayslipInputsDto } from './dto/update-payslip-inputs.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';

const RUN_INCLUDE = { payslips: { include: { employee: true }, orderBy: { id: 'asc' as const } } };

@Injectable()
export class PayrollService {
  constructor(
    private prisma: PrismaService,
    private calc: PayrollCalculationService,
    private configService: PayrollConfigService,
    private posting: PayrollPostingService,
  ) {}

  // Builds one Draft run + a payslip per payrollActive employee, using their current salary
  // fields and zeroed manual inputs (overtime/unpaid-leave/other-deductions) — editable via
  // updateManualInputs before processing. Loan installment is only decided at process().
  async generateRun(dto: GenerateRunDto) {
    const config = await this.configService.get();
    const employees = await this.prisma.employee.findMany({ where: { payrollActive: true } });
    if (employees.length === 0) throw new BadRequestException('No payroll-active employees to generate a run for.');

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: { periodStart: new Date(dto.periodStart), periodEnd: new Date(dto.periodEnd) },
      });
      await tx.payrollRun.update({ where: { id: run.id }, data: { runNo: `PR-${String(run.id).padStart(6, '0')}` } });

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;

      for (const employee of employees) {
        const result = this.calc.calculatePayslip(
          {
            isQatari: employee.isQatari,
            basicSalary: employee.basicSalary,
            housingAllowance: employee.housingAllowance,
            transportationAllowance: employee.transportationAllowance,
            telephoneAllowance: employee.telephoneAllowance,
            otherAllowance: employee.otherAllowance,
            overtimeHours: 0,
            nightOvertimeHours: 0,
            unpaidLeaveDays: 0,
            loanDeduction: 0,
            otherDeductions: 0,
          },
          config,
        );

        await tx.payslip.create({
          data: {
            payrollRunId: run.id,
            employeeId: employee.id,
            basicSalary: employee.basicSalary,
            allowancesTotal: result.allowancesTotal,
            allowancesBreakdown: result.allowancesBreakdown,
            overtimeAmount: result.overtimeAmount,
            unpaidLeaveDeduction: result.unpaidLeaveDeduction,
            grossPay: result.grossPay,
            grsiaEmployeeAmount: result.grsiaEmployeeAmount,
            grsiaEmployerAmount: result.grsiaEmployerAmount,
            totalDeductions: result.totalDeductions,
            netPay: result.netPay,
            isQatari: employee.isQatari,
          },
        });

        totalGross += result.grossPay;
        totalDeductions += result.totalDeductions;
        totalNet += result.netPay;
      }

      return tx.payrollRun.update({
        where: { id: run.id },
        data: { totalGross, totalDeductions, totalNet },
        include: RUN_INCLUDE,
      });
    }, { timeout: 15000 });
  }

  async findAll() {
    return this.prisma.payrollRun.findMany({ orderBy: { id: 'desc' } });
  }

  async findOne(id: number) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: RUN_INCLUDE });
    if (!run) throw new NotFoundException(`Payroll run ${id} not found`);
    return run;
  }

  async findPayslips(id: number) {
    return this.prisma.payslip.findMany({ where: { payrollRunId: id }, include: { employee: true }, orderBy: { id: 'asc' } });
  }

  async remove(id: number) {
    const claim = await this.prisma.payrollRun.deleteMany({ where: { id, status: 'DRAFT' } });
    if (claim.count === 0) {
      const run = await this.prisma.payrollRun.findUnique({ where: { id } });
      if (!run) throw new NotFoundException(`Payroll run ${id} not found`);
      throw new BadRequestException('Only a Draft run can be deleted');
    }
    return { id };
  }

  async updatePayslipInputs(payslipId: number, dto: UpdatePayslipInputsDto) {
    const payslip = await this.prisma.payslip.findUnique({ where: { id: payslipId }, include: { payrollRun: true, employee: true } });
    if (!payslip) throw new NotFoundException(`Payslip ${payslipId} not found`);

    const config = await this.configService.get();
    const result = this.calc.calculatePayslip(
      {
        isQatari: payslip.employee.isQatari,
        basicSalary: payslip.employee.basicSalary,
        housingAllowance: payslip.employee.housingAllowance,
        transportationAllowance: payslip.employee.transportationAllowance,
        telephoneAllowance: payslip.employee.telephoneAllowance,
        otherAllowance: payslip.employee.otherAllowance,
        overtimeHours: dto.overtimeHours ?? payslip.overtimeHours,
        nightOvertimeHours: dto.nightOvertimeHours ?? payslip.nightOvertimeHours,
        unpaidLeaveDays: dto.unpaidLeaveDays ?? payslip.unpaidLeaveDays,
        loanDeduction: 0,
        otherDeductions: dto.otherDeductions ?? payslip.otherDeductions,
      },
      config,
    );

    // Guard via the payslip's own run status at write time, not the read above — a concurrent
    // process() could flip the run out of Draft between the read and this write otherwise.
    const claim = await this.prisma.payslip.updateMany({
      where: { id: payslipId, payrollRun: { status: 'DRAFT' } },
      data: {
        overtimeHours: dto.overtimeHours ?? payslip.overtimeHours,
        nightOvertimeHours: dto.nightOvertimeHours ?? payslip.nightOvertimeHours,
        unpaidLeaveDays: dto.unpaidLeaveDays ?? payslip.unpaidLeaveDays,
        otherDeductions: dto.otherDeductions ?? payslip.otherDeductions,
        allowancesTotal: result.allowancesTotal,
        overtimeAmount: result.overtimeAmount,
        unpaidLeaveDeduction: result.unpaidLeaveDeduction,
        grossPay: result.grossPay,
        totalDeductions: result.totalDeductions,
        netPay: result.netPay,
      },
    });
    if (claim.count === 0) throw new BadRequestException('Can only edit a payslip while its run is still Draft');

    await this.recomputeRunTotals(payslip.payrollRunId);
    return this.prisma.payslip.findUnique({ where: { id: payslipId } });
  }

  async removePayslip(payslipId: number) {
    const payslip = await this.prisma.payslip.findUnique({ where: { id: payslipId }, include: { payrollRun: true } });
    if (!payslip) throw new NotFoundException(`Payslip ${payslipId} not found`);

    const claim = await this.prisma.payslip.deleteMany({ where: { id: payslipId, payrollRun: { status: 'DRAFT' } } });
    if (claim.count === 0) throw new BadRequestException('Can only remove a payslip while its run is still Draft');

    await this.recomputeRunTotals(payslip.payrollRunId);
    return { removed: true };
  }

  private async recomputeRunTotals(runId: number) {
    const payslips = await this.prisma.payslip.findMany({ where: { payrollRunId: runId } });
    const totalGross = payslips.reduce((s, p) => s + p.grossPay, 0);
    const totalDeductions = payslips.reduce((s, p) => s + p.totalDeductions, 0);
    const totalNet = payslips.reduce((s, p) => s + p.netPay, 0);
    await this.prisma.payrollRun.update({ where: { id: runId }, data: { totalGross, totalDeductions, totalNet } });
  }

  // Draft -> Processed: applies each employee's active-loan installment (if any) and posts
  // the run's GL entry. Irreversible in the sense that a Processed run can no longer be deleted.
  async process(id: number) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: { payslips: { include: { employee: { include: { loans: true } } } } } });
    if (!run) throw new NotFoundException(`Payroll run ${id} not found`);

    return this.prisma.$transaction(async (tx) => {
      // Claim the transition up front — the WHERE clause, not the read above, is what stops
      // two concurrent process() calls from both applying loan deductions and posting GL twice.
      const claim = await tx.payrollRun.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'PROCESSED' } });
      if (claim.count === 0) throw new BadRequestException(`Run ${id} is not a draft (status: ${run.status})`);

      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      const finalPayslips: any[] = [];

      for (const payslip of run.payslips) {
        const activeLoan = payslip.employee.loans.find((l) => l.status === 'ACTIVE');
        let loanDeduction = 0;

        if (activeLoan) {
          loanDeduction = Math.min(activeLoan.monthlyDeduction, activeLoan.outstandingBalance);
          if (loanDeduction > 0.001) {
            const newBalance = activeLoan.outstandingBalance - loanDeduction;
            await tx.employeeLoan.update({
              where: { id: activeLoan.id },
              data: { outstandingBalance: newBalance, status: newBalance <= 0.005 ? 'CLOSED' : 'ACTIVE' },
            });
            await tx.employeeLoanRepayment.create({
              data: { employeeLoanId: activeLoan.id, payslipId: payslip.id, amount: loanDeduction },
            });
          }
        }

        const totalDed = payslip.unpaidLeaveDeduction + payslip.grsiaEmployeeAmount + loanDeduction + payslip.otherDeductions;
        const netPay = payslip.grossPay - totalDed;

        const updated = await tx.payslip.update({
          where: { id: payslip.id },
          data: { loanDeduction, totalDeductions: totalDed, netPay },
        });
        finalPayslips.push(updated);

        totalGross += payslip.grossPay;
        totalDeductions += totalDed;
        totalNet += netPay;
      }

      const entry = await this.posting.postPayrollRun(tx, run.id, finalPayslips);

      return tx.payrollRun.update({
        where: { id },
        data: { totalGross, totalDeductions, totalNet, journalEntryId: entry.id },
        include: RUN_INCLUDE,
      });
    }, { timeout: 15000 });
  }

  // Processed -> Paid: posts the disbursement entry (Dr Salary Payable / Cr chosen journal).
  async markPaid(id: number, dto: MarkPaidDto) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException(`Payroll run ${id} not found`);

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.payrollRun.updateMany({ where: { id, status: 'PROCESSED' }, data: { status: 'PAID' } });
      if (claim.count === 0) throw new BadRequestException(`Run ${id} must be Processed before it can be marked Paid (status: ${run.status})`);

      const entry = await this.posting.postPayrollDisbursement(tx, id, run.totalNet, dto.journalId);
      return tx.payrollRun.update({
        where: { id },
        data: { paymentJournalEntryId: entry.id },
        include: RUN_INCLUDE,
      });
    });
  }
}

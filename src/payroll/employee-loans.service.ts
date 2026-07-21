import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollPostingService } from './payroll-posting.service';
import { IssueLoanDto } from './dto/issue-loan.dto';
import { RepayLoanDto } from './dto/repay-loan.dto';

@Injectable()
export class EmployeeLoansService {
  constructor(
    private prisma: PrismaService,
    private posting: PayrollPostingService,
  ) {}

  // v1 limitation (matches the reference implementation): one active loan per employee at a time.
  async issue(dto: IssueLoanDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw new NotFoundException(`Employee ${dto.employeeId} not found`);

    const existingActive = await this.prisma.employeeLoan.findFirst({ where: { employeeId: dto.employeeId, status: 'ACTIVE' } });
    if (existingActive) throw new BadRequestException(`Employee ${dto.employeeId} already has an active loan (#${existingActive.id})`);

    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.employeeLoan.create({
        data: {
          employeeId: dto.employeeId,
          principalAmount: dto.principalAmount,
          monthlyDeduction: dto.monthlyDeduction,
          outstandingBalance: dto.principalAmount,
        },
      });
      await tx.employeeLoan.update({ where: { id: loan.id }, data: { loanNo: `LOAN-${String(loan.id).padStart(6, '0')}` } });

      const entry = await this.posting.postLoanIssuance(tx, loan.id, dto.principalAmount, dto.journalId);
      return tx.employeeLoan.update({ where: { id: loan.id }, data: { journalEntryId: entry.id } });
    }, { timeout: 15000 });
  }

  async findAll(employeeId?: number, status?: string) {
    return this.prisma.employeeLoan.findMany({
      where: { employeeId, status: status as any },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const loan = await this.prisma.employeeLoan.findUnique({
      where: { id },
      include: { employee: true, repayments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!loan) throw new NotFoundException(`Loan ${id} not found`);
    return loan;
  }

  async findRepayments(id: number) {
    return this.prisma.employeeLoanRepayment.findMany({ where: { employeeLoanId: id }, orderBy: { createdAt: 'desc' } });
  }

  async manualRepayment(id: number, dto: RepayLoanDto) {
    const loan = await this.prisma.employeeLoan.findUnique({ where: { id } });
    if (!loan) throw new NotFoundException(`Loan ${id} not found`);
    if (loan.status !== 'ACTIVE') throw new BadRequestException(`Loan ${id} is not active`);
    if (dto.amount > loan.outstandingBalance + 0.01) {
      throw new BadRequestException(`Repayment (${dto.amount}) exceeds outstanding balance (${loan.outstandingBalance})`);
    }

    return this.prisma.$transaction(async (tx) => {
      const newBalance = loan.outstandingBalance - dto.amount;
      await tx.employeeLoan.update({
        where: { id },
        data: { outstandingBalance: newBalance, status: newBalance <= 0.005 ? 'CLOSED' : 'ACTIVE' },
      });
      await tx.employeeLoanRepayment.create({ data: { employeeLoanId: id, amount: dto.amount } });
      await this.posting.postLoanRepayment(tx, id, dto.amount, dto.journalId);

      return tx.employeeLoan.findUnique({ where: { id }, include: { repayments: true } });
    }, { timeout: 15000 });
  }
}

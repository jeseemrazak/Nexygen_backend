import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private journalService: JournalService,
  ) {}

  async findAll(status?: string) {
    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    return this.prisma.expense.findMany({
      where,
      include: { category: { include: { account: true } }, costCenter: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: { include: { account: true } }, costCenter: true },
    });
    if (!expense) throw new NotFoundException(`Expense ${id} not found`);
    return expense;
  }

  async create(dto: CreateExpenseDto) {
    return this.prisma.$transaction(async (tx) => {
      // expenseNumber starts null (not a placeholder string) so a concurrent create can never
      // collide on the unique constraint before either row gets its real, id-based number.
      const expense = await tx.expense.create({
        data: { categoryId: dto.categoryId, payeeName: dto.payeeName, description: dto.description, amount: dto.amount, costCenterId: dto.costCenterId },
      });
      return tx.expense.update({
        where: { id: expense.id },
        data: { expenseNumber: `EXP-${String(expense.id).padStart(6, '0')}` },
        include: { category: { include: { account: true } }, costCenter: true },
      });
    });
  }

  async update(id: number, dto: Partial<CreateExpenseDto>) {
    // Conditional updateMany closes the race against a concurrent approve()/reject() —
    // the WHERE clause (not a prior read) is what guarantees the expense is still Draft.
    const claim = await this.prisma.expense.updateMany({ where: { id, status: 'DRAFT' }, data: dto });
    if (claim.count === 0) {
      const expense = await this.prisma.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException(`Expense ${id} not found`);
      throw new BadRequestException('Only Draft expenses can be edited');
    }
    return this.prisma.expense.findUnique({ where: { id }, include: { category: { include: { account: true } } } });
  }

  async remove(id: number) {
    const claim = await this.prisma.expense.deleteMany({ where: { id, status: 'DRAFT' } });
    if (claim.count === 0) {
      const expense = await this.prisma.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException(`Expense ${id} not found`);
      throw new BadRequestException('Only Draft expenses can be deleted');
    }
    return { id };
  }

  // Draft -> Approved: Dr [category's expense account] / Cr Expenses Payable.
  async approve(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id }, include: { category: true } });
      if (!expense) throw new NotFoundException(`Expense ${id} not found`);

      // The claim guard is the updateMany's WHERE, not this earlier read — two concurrent
      // approve() calls can both pass the read check above, but only one can flip DRAFT -> APPROVED.
      const claim = await tx.expense.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'APPROVED', approvedAt: new Date() },
      });
      if (claim.count === 0) throw new BadRequestException(`Expense ${id} is not Draft (status: ${expense.status})`);

      const payableAccountId = await this.journalService.getMappedAccountId(tx, AccountMappingRole.EXPENSES_PAYABLE);
      await this.journalService.postEntry(tx, {
        sourceType: 'EXPENSE_APPROVAL',
        sourceId: id,
        memo: `Expense ${expense.expenseNumber} — ${expense.payeeName}`,
        lines: [
          { accountId: expense.category.accountId, debit: expense.amount, description: expense.description || undefined, costCenterId: expense.costCenterId ?? undefined },
          { accountId: payableAccountId, credit: expense.amount },
        ],
      });

      return tx.expense.findUnique({ where: { id }, include: { category: { include: { account: true } } } });
    });
  }

  // Draft -> Rejected. No GL effect.
  async reject(id: number) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException(`Expense ${id} not found`);
    const claim = await this.prisma.expense.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'REJECTED' } });
    if (claim.count === 0) throw new BadRequestException(`Expense ${id} is not Draft (status: ${expense.status})`);
    return this.prisma.expense.findUnique({ where: { id } });
  }

  // Approved -> Paid: Dr Expenses Payable / Cr Cash/Bank.
  async pay(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException(`Expense ${id} not found`);

      const claim = await tx.expense.updateMany({
        where: { id, status: 'APPROVED' },
        data: { status: 'PAID', paidAt: new Date() },
      });
      if (claim.count === 0) throw new BadRequestException(`Expense ${id} is not Approved (status: ${expense.status})`);

      const [payableAccountId, cashAccountId] = await Promise.all([
        this.journalService.getMappedAccountId(tx, AccountMappingRole.EXPENSES_PAYABLE),
        this.journalService.getMappedAccountId(tx, AccountMappingRole.CASH_BANK),
      ]);
      await this.journalService.postEntry(tx, {
        sourceType: 'EXPENSE_PAYMENT',
        sourceId: id,
        memo: `Payment for expense ${expense.expenseNumber}`,
        lines: [
          { accountId: payableAccountId, debit: expense.amount },
          { accountId: cashAccountId, credit: expense.amount },
        ],
      });

      return tx.expense.findUnique({ where: { id }, include: { category: { include: { account: true } } } });
    });
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';

@Injectable()
export class ExpenseCategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateExpenseCategoryDto) {
    return this.prisma.expenseCategory.create({ data: dto, include: { account: true } });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.expenseCategory.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: { account: true },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: number, dto: Partial<CreateExpenseCategoryDto>) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Expense category ${id} not found`);
    return this.prisma.expenseCategory.update({ where: { id }, data: dto, include: { account: true } });
  }

  async remove(id: number) {
    const count = await this.prisma.expense.count({ where: { categoryId: id } });
    if (count > 0) {
      throw new BadRequestException(`Cannot delete category — it has ${count} expense(s) recorded against it. Deactivate it instead.`);
    }
    return this.prisma.expenseCategory.delete({ where: { id } });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

// On Account is the one method with no journal — it bills the customer instead of touching cash/bank.
const DEFAULT_PAYMENT_METHODS: { name: string; type: 'CASH_BANK' | 'ACCOUNT_RECEIVABLE'; journalCode?: string; sortOrder: number }[] = [
  { name: 'Cash', type: 'CASH_BANK', journalCode: 'CASH', sortOrder: 0 },
  { name: 'Bank Transfer', type: 'CASH_BANK', journalCode: 'BANK', sortOrder: 1 },
  { name: 'Card', type: 'CASH_BANK', journalCode: 'BANK', sortOrder: 2 },
  { name: 'On Account', type: 'ACCOUNT_RECEIVABLE', sortOrder: 3 },
];

@Injectable()
export class PaymentMethodsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePaymentMethodDto) {
    return this.prisma.paymentMethod.create({ data: dto });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.paymentMethod.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: { journal: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: number) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id }, include: { journal: true } });
    if (!method) throw new NotFoundException(`Payment method ${id} not found`);
    return method;
  }

  async update(id: number, dto: UpdatePaymentMethodDto) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException(`Payment method ${id} not found`);
    return this.prisma.paymentMethod.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException(`Payment method ${id} not found`);
    return this.prisma.paymentMethod.delete({ where: { id } });
  }

  // Idempotent — requires Journals to already be seeded (resolves journalId by code).
  async seedDefaults() {
    for (const method of DEFAULT_PAYMENT_METHODS) {
      const journal = method.journalCode ? await this.prisma.journal.findUnique({ where: { code: method.journalCode } }) : null;
      await this.prisma.paymentMethod.upsert({
        where: { name: method.name },
        update: {},
        create: {
          name: method.name,
          type: method.type,
          journalId: journal?.id,
          sortOrder: method.sortOrder,
        },
      });
    }
    return this.findAll();
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalDto } from './dto/create-journal.dto';
import { UpdateJournalDto } from './dto/update-journal.dto';

// Odoo-style journals: Sales/Purchase post AR/AP by default, Cash/Bank post to themselves
// (used when a payment is settled directly rather than against an invoice), Misc/Payroll/
// Commissions have no default accounts — the posting call site always supplies both legs.
const DEFAULT_JOURNALS: {
  code: string;
  name: string;
  type: 'SALE' | 'PURCHASE' | 'CASH' | 'BANK' | 'MISC';
  sequencePrefix: string;
  defaultDebitCode?: string;
  defaultCreditCode?: string;
}[] = [
  { code: 'SALE', name: 'Sales Journal', type: 'SALE', sequencePrefix: 'INV/', defaultDebitCode: '1100', defaultCreditCode: '4000' },
  { code: 'PURCH', name: 'Purchase Journal', type: 'PURCHASE', sequencePrefix: 'BILL/', defaultDebitCode: '5000', defaultCreditCode: '2000' },
  { code: 'CASH', name: 'Cash', type: 'CASH', sequencePrefix: 'CASH/', defaultDebitCode: '1000', defaultCreditCode: '1000' },
  { code: 'BANK', name: 'Bank', type: 'BANK', sequencePrefix: 'BANK/', defaultDebitCode: '1010', defaultCreditCode: '1010' },
  { code: 'MISC', name: 'Miscellaneous Operations', type: 'MISC', sequencePrefix: 'MISC/' },
  { code: 'PAYROLL', name: 'Payroll', type: 'MISC', sequencePrefix: 'PR/' },
  { code: 'COMM', name: 'Commissions', type: 'MISC', sequencePrefix: 'COMM/' },
];

@Injectable()
export class JournalsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateJournalDto) {
    return this.prisma.journal.create({ data: dto });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.journal.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: { defaultDebitAccount: true, defaultCreditAccount: true },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: number) {
    const journal = await this.prisma.journal.findUnique({
      where: { id },
      include: { defaultDebitAccount: true, defaultCreditAccount: true },
    });
    if (!journal) throw new NotFoundException(`Journal ${id} not found`);
    return journal;
  }

  async update(id: number, dto: UpdateJournalDto) {
    const journal = await this.prisma.journal.findUnique({ where: { id } });
    if (!journal) throw new NotFoundException(`Journal ${id} not found`);
    return this.prisma.journal.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const journal = await this.prisma.journal.findUnique({ where: { id } });
    if (!journal) throw new NotFoundException(`Journal ${id} not found`);

    const [entryCount, methodCount] = await Promise.all([
      this.prisma.journalEntry.count({ where: { journalId: id } }),
      this.prisma.paymentMethod.count({ where: { journalId: id } }),
    ]);
    if (entryCount > 0 || methodCount > 0) {
      throw new BadRequestException(`Cannot delete journal ${journal.code} — it has posted entries or linked payment methods. Deactivate it instead.`);
    }
    return this.prisma.journal.delete({ where: { id } });
  }

  // Idempotent — safe to call more than once. Requires the Chart of Accounts to already be
  // seeded (resolves default debit/credit accounts by code).
  async seedDefaults() {
    for (const journal of DEFAULT_JOURNALS) {
      const [debitAccount, creditAccount] = await Promise.all([
        journal.defaultDebitCode ? this.prisma.account.findUnique({ where: { code: journal.defaultDebitCode } }) : null,
        journal.defaultCreditCode ? this.prisma.account.findUnique({ where: { code: journal.defaultCreditCode } }) : null,
      ]);

      await this.prisma.journal.upsert({
        where: { code: journal.code },
        update: {},
        create: {
          code: journal.code,
          name: journal.name,
          type: journal.type,
          sequencePrefix: journal.sequencePrefix,
          defaultDebitAccountId: debitAccount?.id,
          defaultCreditAccountId: creditAccount?.id,
        },
      });
    }
    return this.findAll();
  }
}

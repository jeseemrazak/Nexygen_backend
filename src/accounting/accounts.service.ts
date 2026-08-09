import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

// Essential Chart of Accounts for a Qatar-based distribution business. Every auto-posting call
// site resolves its destination account through an AccountMapping role (admin-editable under
// Settings → Account Mappings) rather than a hardcoded code — DEFAULT_ROLE_ACCOUNTS below is just
// the starting-point mapping seedDefaults() creates, not a hardcoded posting destination itself.
const DEFAULT_ACCOUNTS: { code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'; subtype?: string }[] = [
  { code: '1000', name: 'Cash/Bank', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1010', name: 'Bank', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1200', name: 'Inventory', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1300', name: 'Employee Advances Receivable', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1350', name: 'Tax Receivable (Input)', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1400', name: 'Prepaid Expenses', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1500', name: 'Fixed Assets', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2050', name: 'Stock Interim (Received)', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2100', name: 'Expenses Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2200', name: 'Salary Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2210', name: 'GRSIA Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2220', name: 'End of Service Gratuity Accrual', type: 'LIABILITY', subtype: 'Long-term Liability' },
  { code: '2230', name: 'Tips Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2240', name: 'Tax Payable (Output)', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2300', name: 'Employee Payable (Commissions/Reimbursements)', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '3000', name: "Owner's Equity", type: 'EQUITY' },
  { code: '4000', name: 'Sales Revenue', type: 'INCOME' },
  { code: '5000', name: 'Purchases / COGS', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5100', name: 'Inventory Adjustment', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5200', name: 'Salary Expense', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5210', name: 'GRSIA Employer Contribution Expense', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5220', name: 'End of Service Gratuity Expense', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5300', name: 'Commission Expense', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5900', name: 'General Expenses', type: 'EXPENSE', subtype: 'Operating Expense' },
];

// Starting-point account for each posting role — only used to populate AccountMapping rows the
// first time seedDefaults() runs (upsert never overwrites a mapping an admin already changed).
const DEFAULT_ROLE_ACCOUNTS: Record<AccountMappingRole, string> = {
  CASH_BANK: '1000',
  ACCOUNTS_RECEIVABLE: '1100',
  ACCOUNTS_PAYABLE: '2000',
  INVENTORY: '1200',
  STOCK_INTERIM: '2050',
  COGS: '5000',
  INVENTORY_ADJUSTMENT: '5100',
  SALES_REVENUE: '4000',
  EXPENSES_PAYABLE: '2100',
  SALARY_EXPENSE: '5200',
  GRSIA_EMPLOYER_EXPENSE: '5210',
  GRSIA_PAYABLE: '2210',
  EMPLOYEE_ADVANCES_RECEIVABLE: '1300',
  SALARY_PAYABLE: '2200',
  EOS_GRATUITY_EXPENSE: '5220',
  EOS_GRATUITY_ACCRUAL: '2220',
  TIPS_PAYABLE: '2230',
  CASH_DIFFERENCE_GAIN: '5950',
  CASH_DIFFERENCE_LOSS: '5960',
  TAX_PAYABLE: '2240',
  TAX_RECEIVABLE: '1350',
};

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAccountDto) {
    return this.prisma.account.create({ data: dto });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.account.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.account.findUnique({ where: { id } });
  }

  // Renaming/deactivating is always safe. Changing `type` reclassifies how the account
  // behaves in every report (debit-normal vs credit-normal, P&L vs Balance Sheet) — only
  // allow that while the account has no posted history, to avoid silently corrupting past reports.
  async update(id: number, dto: UpdateAccountDto) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);

    if (dto.type && dto.type !== account.type) {
      const lineCount = await this.prisma.journalLine.count({ where: { accountId: id } });
      if (lineCount > 0) {
        throw new BadRequestException(
          `Cannot change the type of account ${account.code} — it already has ${lineCount} posted journal line(s).`,
        );
      }
    }

    return this.prisma.account.update({
      where: { id },
      data: { name: dto.name, type: dto.type, isActive: dto.isActive },
    });
  }

  // True deletion is only safe for an account nobody has ever posted to — otherwise
  // deactivate it instead so historical journal lines keep a valid account to point at.
  async remove(id: number) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    if (account.isSystemAccount) {
      throw new BadRequestException(`Account ${account.code} is a system account used by auto-posting and cannot be deleted.`);
    }

    const lineCount = await this.prisma.journalLine.count({ where: { accountId: id } });
    if (lineCount > 0) {
      throw new BadRequestException(
        `Cannot delete account ${account.code} — it has ${lineCount} posted journal line(s). Deactivate it instead.`,
      );
    }

    return this.prisma.account.delete({ where: { id } });
  }

  // Idempotent — safe to call more than once. Creates the minimum Chart of Accounts
  // needed for auto-posting from Sales/Purchase activity; more accounts can be added freely.
  // Also seeds each AccountMapping role to its default account, but only if that role has no
  // mapping row yet — never overwrites a remap an admin already made from Settings.
  async seedDefaults() {
    for (const account of DEFAULT_ACCOUNTS) {
      await this.prisma.account.upsert({
        where: { code: account.code },
        update: { subtype: account.subtype },
        create: { ...account, isSystemAccount: true },
      });
    }

    for (const role of Object.keys(DEFAULT_ROLE_ACCOUNTS) as AccountMappingRole[]) {
      const existing = await this.prisma.accountMapping.findUnique({ where: { role } });
      if (existing) continue;
      const account = await this.prisma.account.findUnique({ where: { code: DEFAULT_ROLE_ACCOUNTS[role] } });
      if (!account) continue;
      await this.prisma.accountMapping.create({ data: { role, accountId: account.id } });
    }

    return this.findAll();
  }

  // "Account Inquiry" — every posting to one account, with a running balance. `from`/`to` scope
  // which lines are actually listed; everything posted before `from` is folded into a single
  // opening balance instead of silently vanishing, so the running balance column stays meaningful.
  async getLedger(id: number, from?: string, to?: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);

    const isDebitNormal = account.type === 'ASSET' || account.type === 'EXPENSE';

    let openingBalance = 0;
    if (from) {
      const { _sum } = await this.prisma.journalLine.aggregate({
        where: { accountId: id, journalEntry: { date: { lt: new Date(from) } } },
        _sum: { debit: true, credit: true },
      });
      const debit = _sum.debit || 0;
      const credit = _sum.credit || 0;
      openingBalance = isDebitNormal ? debit - credit : credit - debit;
    }

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to + 'T23:59:59.999Z');

    const lines = await this.prisma.journalLine.findMany({
      where: { accountId: id, ...(Object.keys(dateFilter).length > 0 && { journalEntry: { date: dateFilter } }) },
      include: { journalEntry: true },
      orderBy: { journalEntry: { date: 'asc' } },
    });

    let runningBalance = openingBalance;
    const rows = lines.map((line) => {
      runningBalance += isDebitNormal ? line.debit - line.credit : line.credit - line.debit;
      return { ...line, runningBalance };
    });

    return { account, openingBalance, lines: rows, endingBalance: runningBalance };
  }
}

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

  // Full Chart of Accounts imported from Meza ERP (ksa.mezafinance.com), per user request —
  // adds granular sub-accounts on top of the essential set above. Five of Meza's codes collided
  // with role-critical accounts already wired into this app's auto-posting; two were skipped as
  // functionally redundant with an existing account, three were renumbered (name/purpose kept
  // identical to Meza's) to the nearest free code in the same block:
  //   2210 VAT Output Tax Payable  -> skipped, redundant with 2240 Tax Payable (Output)
  //   5100 Cost of Goods Sold      -> skipped, redundant with 5000 Purchases / COGS
  //   1350 Food Inventory — Perishable -> renumbered to 1345 (1350 is Tax Receivable here)
  //   2220 VAT Control Account         -> renumbered to 2205 (2220 is EOS Gratuity Accrual here)
  //   2230 Withholding Tax Payable     -> renumbered to 2235 (2230 is Tips Payable here)
  { code: '1110', name: 'Petty Cash', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1120', name: 'Cash at Bank — Main Account', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1130', name: 'Cash at Bank — Payroll Account', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1210', name: 'Trade Receivables', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1220', name: 'Staff Receivables', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1230', name: 'Other Receivables', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1310', name: 'Raw Materials', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1320', name: 'Work in Progress', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1330', name: 'Finished Goods', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1340', name: 'Goods in Transit', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1345', name: 'Food Inventory — Perishable', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1355', name: 'Food Inventory — Dry & Ambient', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1360', name: 'Frozen Inventory', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1365', name: 'Beverage Inventory', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1370', name: 'Packaging & Disposables Inventory', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1410', name: 'Prepaid Expenses', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1420', name: 'Security Deposits', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1430', name: 'VAT Input Tax Receivable', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1440', name: 'Other Current Assets', type: 'ASSET', subtype: 'Current Asset' },
  { code: '1511', name: 'Land & Buildings', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1512', name: 'Motor Vehicles', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1513', name: 'Furniture & Fixtures', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1514', name: 'Office Equipment', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1515', name: 'Computer & IT Equipment', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1516', name: 'Leasehold Improvements', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1521', name: 'Accum. Depr. — Buildings', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1522', name: 'Accum. Depr. — Vehicles', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1523', name: 'Accum. Depr. — Furniture', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1524', name: 'Accum. Depr. — Office Equipment', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1525', name: 'Accum. Depr. — Computer Equipment', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1610', name: 'Goodwill', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1620', name: 'Software & Licenses', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1710', name: 'Security Deposits — Long Term', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '1720', name: 'Other Long-term Assets', type: 'ASSET', subtype: 'Non-current Asset' },
  { code: '2110', name: 'Trade Payables', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2120', name: 'Accrued Expenses', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2130', name: 'Other Payables', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2205', name: 'VAT Control Account', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2235', name: 'Withholding Tax Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2310', name: 'Salaries & Wages Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2320', name: 'Annual Leave Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2330', name: 'End of Service Gratuity Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2340', name: 'GPSSA Contributions Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2350', name: 'Employee Advances Payable', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2410', name: 'Advance from Customers', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2420', name: 'Deferred Revenue', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2430', name: 'Bank Overdraft', type: 'LIABILITY', subtype: 'Current Liability' },
  { code: '2510', name: 'Long-term Loans', type: 'LIABILITY', subtype: 'Long-term Liability' },
  { code: '2520', name: 'Lease Liabilities', type: 'LIABILITY', subtype: 'Long-term Liability' },
  { code: '2530', name: 'Other Long-term Liabilities', type: 'LIABILITY', subtype: 'Long-term Liability' },
  { code: '3100', name: 'Share Capital', type: 'EQUITY' },
  { code: '3200', name: 'Legal Reserve', type: 'EQUITY' },
  { code: '3300', name: 'General Reserve', type: 'EQUITY' },
  { code: '3400', name: 'Retained Earnings', type: 'EQUITY' },
  { code: '3500', name: 'Current Year Profit / Loss', type: 'EQUITY' },
  { code: '3600', name: "Owner's Drawings", type: 'EQUITY' },
  { code: '4110', name: 'Product Sales', type: 'INCOME' },
  { code: '4120', name: 'Service Revenue', type: 'INCOME' },
  { code: '4130', name: 'Project Revenue', type: 'INCOME' },
  { code: '4170', name: 'Catering — Events & Functions', type: 'INCOME' },
  { code: '4175', name: 'Catering — Contract & Corporate Meals', type: 'INCOME' },
  { code: '4180', name: 'Food & Beverage Sales', type: 'INCOME' },
  { code: '4185', name: 'Delivery & Service Charges', type: 'INCOME' },
  { code: '4210', name: 'Interest Income', type: 'INCOME' },
  { code: '4220', name: 'Foreign Exchange Gain', type: 'INCOME' },
  { code: '4230', name: 'Rental Income', type: 'INCOME' },
  { code: '4240', name: 'Miscellaneous Income', type: 'INCOME' },
  { code: '4250', name: 'Gain on Disposal of Fixed Assets', type: 'INCOME' },
  { code: '4310', name: 'Sales Returns', type: 'INCOME' },
  { code: '4320', name: 'Sales Discounts', type: 'INCOME' },
  { code: '5110', name: 'Direct Materials', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5120', name: 'Direct Labor', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5130', name: 'Manufacturing Overhead', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5140', name: 'Freight & Delivery', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5150', name: 'Food Cost — Fresh & Perishable', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5155', name: 'Food Cost — Dry & Ambient', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5160', name: 'Frozen & Meat Cost', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5165', name: 'Beverage Cost', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5170', name: 'Packaging & Disposables Cost', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5175', name: 'Kitchen Consumables & Gas', type: 'EXPENSE', subtype: 'Cost of Revenue' },
  { code: '5510', name: 'Basic Salary', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5520', name: 'Housing Allowance', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5530', name: 'Transport Allowance', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5540', name: 'Other Allowances', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5550', name: 'Overtime Pay', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5560', name: 'End of Service Gratuity Expense', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5570', name: 'GPSSA — Employer Contribution', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5580', name: 'Staff Training & Development', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5590', name: 'Medical Insurance', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5610', name: 'Office Rent', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5620', name: 'Utilities — Electricity & Water', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5630', name: 'Maintenance & Repairs', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5710', name: 'Office Supplies', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5720', name: 'Telephone & Internet', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5730', name: 'Postage & Courier', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5740', name: 'Travel & Accommodation', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5750', name: 'Professional Fees', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5760', name: 'Insurance Premiums', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5770', name: 'Subscriptions & Software', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5780', name: 'Government Fees & Licenses', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5790', name: 'Miscellaneous Expenses', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5810', name: 'Advertising & Promotion', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5820', name: 'Sales Commissions', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5830', name: 'Entertainment & Hospitality', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5910', name: 'Bank Charges & Fees', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5920', name: 'Interest Expense', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5930', name: 'Foreign Exchange Loss', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5951', name: 'Depreciation Expense', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5952', name: 'Amortization Expense', type: 'EXPENSE', subtype: 'Operating Expense' },
  { code: '5953', name: 'Loss on Disposal of Fixed Assets', type: 'EXPENSE', subtype: 'Operating Expense' },
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

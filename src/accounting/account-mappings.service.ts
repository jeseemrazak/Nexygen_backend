import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Label/description/group shown in the Settings UI, in seed/display order — grouping mirrors
// the business areas that post through each role (Cash & Parties, Inventory & COGS, Sales,
// Payroll) so the mapping page reads like a form, not a flat alphabetical dump.
const ROLE_META: Record<AccountMappingRole, { label: string; description: string; group: string }> = {
  CASH_BANK: { label: 'Cash / Bank (default)', description: 'Fallback cash leg for payments when no specific journal is chosen', group: 'Cash & Parties' },
  ACCOUNTS_RECEIVABLE: { label: 'Accounts Receivable', description: 'What customers owe — debited on sales invoices, credited on customer payments', group: 'Cash & Parties' },
  ACCOUNTS_PAYABLE: { label: 'Accounts Payable', description: 'What we owe suppliers — credited on bills, debited on supplier payments', group: 'Cash & Parties' },
  EXPENSES_PAYABLE: { label: 'Expenses Payable', description: 'Accrued liability for approved-but-unpaid expenses', group: 'Cash & Parties' },
  INVENTORY: { label: 'Inventory', description: 'Stock asset value — moves on receipts, deliveries, POS sales, and stock adjustments', group: 'Inventory & COGS' },
  STOCK_INTERIM: { label: 'Stock Interim (Received)', description: 'Holds the value of goods received before the supplier bill is posted', group: 'Inventory & COGS' },
  COGS: { label: 'Cost of Goods Sold', description: 'Cost recognized when stock ships on a delivery or POS sale', group: 'Inventory & COGS' },
  INVENTORY_ADJUSTMENT: { label: 'Inventory Adjustment', description: 'Offsetting expense/gain for manual stock-count corrections and write-offs', group: 'Inventory & COGS' },
  SALES_REVENUE: { label: 'Sales Revenue', description: 'Income recognized on sales invoices and POS sales', group: 'Sales' },
  SALARY_EXPENSE: { label: 'Salary Expense', description: 'Gross salary cost recognized when a payroll run is posted', group: 'Payroll' },
  GRSIA_EMPLOYER_EXPENSE: { label: 'GRSIA Employer Contribution Expense', description: 'Employer-side GRSIA contribution cost', group: 'Payroll' },
  GRSIA_PAYABLE: { label: 'GRSIA Payable', description: 'Employee + employer GRSIA owed to the authority', group: 'Payroll' },
  EMPLOYEE_ADVANCES_RECEIVABLE: { label: 'Employee Advances Receivable', description: 'Outstanding employee loans, reduced by payroll deductions or manual repayment', group: 'Payroll' },
  SALARY_PAYABLE: { label: 'Salary Payable', description: 'Net pay owed to staff until disbursed', group: 'Payroll' },
  EOS_GRATUITY_EXPENSE: { label: 'EOS Gratuity Expense', description: 'Monthly end-of-service gratuity accrual cost', group: 'Payroll' },
  EOS_GRATUITY_ACCRUAL: { label: 'EOS Gratuity Accrual', description: 'Accumulated end-of-service gratuity liability', group: 'Payroll' },
  TIPS_PAYABLE: { label: 'Tips Payable', description: 'Tips collected on restaurant tabs, owed out to staff', group: 'Sales' },
  CASH_DIFFERENCE_GAIN: { label: 'Cash Difference Gain', description: 'Gain recognized when actual cash counted exceeds expected amount at register close', group: 'Cash & Parties' },
  CASH_DIFFERENCE_LOSS: { label: 'Cash Difference Loss', description: 'Loss recognized when actual cash counted is less than expected amount at register close', group: 'Cash & Parties' },
  TAX_PAYABLE: { label: 'Tax Payable (Output)', description: 'Tax collected on sales invoices and POS sales, owed to the tax authority', group: 'Sales' },
  TAX_RECEIVABLE: { label: 'Tax Receivable (Input)', description: 'Recoverable tax paid on supplier bills', group: 'Inventory & COGS' },
};

@Injectable()
export class AccountMappingsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const mappings = await this.prisma.accountMapping.findMany({ include: { account: true } });
    const byRole = new Map(mappings.map((m) => [m.role, m]));

    return (Object.keys(ROLE_META) as AccountMappingRole[]).map((role) => ({
      role,
      ...ROLE_META[role],
      account: byRole.get(role)?.account ?? null,
    }));
  }

  async update(role: AccountMappingRole, accountId: number) {
    if (!ROLE_META[role]) {
      throw new BadRequestException(`Unknown account mapping role: ${role}`);
    }

    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    if (!account.isActive) throw new BadRequestException(`Account ${account.code} — ${account.name} is deactivated and can't be mapped`);

    return this.prisma.accountMapping.upsert({
      where: { role },
      update: { accountId },
      create: { role, accountId },
      include: { account: true },
    });
  }
}

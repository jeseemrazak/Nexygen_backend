import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';

@Injectable()
export class JournalService {
  constructor(private prisma: PrismaService) {}

  // Resolves a well-known Chart of Accounts code (e.g. '1100') to its id — used only by seed
  // scripts and the few reporting spots that read a fixed system account directly, never by
  // auto-posting call sites (those resolve through getMappedAccountId so the destination is
  // admin-configurable from Settings → Account Mappings instead of hardcoded).
  async getAccountIdByCode(tx: any, code: string): Promise<number> {
    const account = await tx.account.findUnique({ where: { code } });
    if (!account) {
      throw new BadRequestException(
        `Chart of Accounts is missing account ${code} — run POST /accounting/accounts/seed-defaults first.`,
      );
    }
    return account.id;
  }

  // Resolves which GL account an auto-posting site should hit for a given role, honoring
  // whatever an admin has mapped under Settings → Account Mappings. tx-scoped so it can be
  // called from inside the same $transaction as the posting it accompanies.
  async getMappedAccountId(tx: any, role: AccountMappingRole): Promise<number> {
    const mapping = await tx.accountMapping.findUnique({ where: { role } });
    if (!mapping) {
      throw new BadRequestException(`No account is mapped for ${role} — configure it under Settings → Account Mappings.`);
    }
    return mapping.accountId;
  }

  // Same as getMappedAccountId but returns the full Account row (for reporting call sites that
  // need the code/name, not just the id, and aren't running inside a posting transaction).
  async getMappedAccount(role: AccountMappingRole) {
    const mapping = await this.prisma.accountMapping.findUnique({ where: { role }, include: { account: true } });
    if (!mapping) {
      throw new BadRequestException(`No account is mapped for ${role} — configure it under Settings → Account Mappings.`);
    }
    return mapping.account;
  }

  // Resolves which GL account a payment's cash/bank leg should hit. If the caller picked a
  // journal, use its default account for that side; otherwise fall back to the CASH_BANK
  // mapping (preserves exact pre-journal behavior for callers that don't pass a journalId).
  async resolveJournalAccount(tx: any, journalId: number | undefined | null, side: 'debit' | 'credit', fallbackRole: AccountMappingRole = AccountMappingRole.CASH_BANK): Promise<number> {
    if (journalId) {
      const journal = await tx.journal.findUnique({ where: { id: journalId } });
      if (!journal) throw new BadRequestException(`Journal ${journalId} not found`);
      const accountId = side === 'debit' ? journal.defaultDebitAccountId : journal.defaultCreditAccountId;
      if (accountId) return accountId;
    }
    return this.getMappedAccountId(tx, fallbackRole);
  }

  // Core double-entry posting primitive. Callable inside an existing $transaction (pass
  // the tx client) so posting stays atomic with the business operation that triggered it.
  async postEntry(
    tx: any,
    params: {
      sourceType:
        | 'MANUAL'
        | 'SALES_INVOICE'
        | 'SALES_PAYMENT'
        | 'PURCHASE_INVOICE'
        | 'PURCHASE_RECEIPT'
        | 'PURCHASE_PAYMENT'
        | 'PARTY_PAYMENT'
        | 'EXPENSE_APPROVAL'
        | 'EXPENSE_PAYMENT'
        | 'POS_SALE'
        | 'POS_SALE_COGS'
        | 'SALES_DELIVERY_COGS'
        | 'PAYROLL_RUN'
        | 'PAYROLL_DISBURSEMENT'
        | 'LOAN_ISSUANCE'
        | 'EOS_ACCRUAL'
        | 'STOCK_ADJUSTMENT';
      sourceId?: number;
      memo?: string;
      date?: Date;
      journalId?: number;
      lines: {
        accountId: number;
        debit?: number;
        credit?: number;
        description?: string;
        partyType?: 'CUSTOMER' | 'SUPPLIER';
        partyName?: string;
      }[];
    },
  ) {
    const totalDebit = params.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredit = params.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new BadRequestException(`Journal entry is unbalanced: debits ${totalDebit} != credits ${totalCredit}`);
    }

    return tx.journalEntry.create({
      data: {
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        memo: params.memo,
        date: params.date ?? new Date(),
        journalId: params.journalId,
        lines: {
          create: params.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit || 0,
            credit: l.credit || 0,
            description: l.description,
            partyType: l.partyType,
            partyName: l.partyName,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
  }

  async createManualEntry(dto: CreateJournalEntryDto) {
    return this.prisma.$transaction(async (tx) => {
      return this.postEntry(tx, {
        sourceType: 'MANUAL',
        memo: dto.memo,
        date: dto.date ? new Date(dto.date) : undefined,
        lines: dto.lines,
      });
    });
  }

  async findAll(filters?: { from?: string; to?: string; accountId?: number; journalId?: number; sourceType?: string; search?: string }) {
    const where: any = {};

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (filters?.from) dateFilter.gte = new Date(filters.from);
    if (filters?.to) dateFilter.lte = new Date(filters.to + 'T23:59:59.999Z');
    if (Object.keys(dateFilter).length > 0) where.date = dateFilter;

    if (filters?.sourceType) where.sourceType = filters.sourceType;
    if (filters?.accountId) where.lines = { some: { accountId: filters.accountId } };
    if (filters?.journalId) where.journalId = filters.journalId;
    if (filters?.search) where.memo = { contains: filters.search, mode: 'insensitive' };

    return this.prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { account: true } }, reversalOf: true, reversedBy: true },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: number) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: { include: { account: true } }, reversalOf: true, reversedBy: true },
    });
    if (!entry) throw new NotFoundException(`Journal entry ${id} not found`);
    return entry;
  }

  // Posted entries are never edited or deleted — a "void" creates an offsetting reversal entry
  // (every line's debit/credit swapped) and marks the original voidedAt, preserving full audit trail.
  async voidEntry(id: number, reason?: string) {
    return this.prisma.$transaction(async (tx) => this.voidEntryInTx(tx, id, reason));
  }

  // Same as voidEntry, but runs against a caller-supplied tx client so it can be composed into
  // a larger atomic operation (e.g. POS sale cancellation, which must restock inventory and
  // reverse the GL in one transaction — two separate transactions would leave a window where a
  // crash mid-sequence strands the ledger with no retry path, since the first step is one-shot).
  async voidEntryInTx(tx: any, id: number, reason?: string) {
    const original = await tx.journalEntry.findUnique({
      where: { id },
      include: { lines: true, reversedBy: true },
    });
    if (!original) throw new NotFoundException(`Journal entry ${id} not found`);
    if (original.voidedAt || original.reversedBy) {
      throw new BadRequestException(`Journal entry ${id} has already been voided`);
    }
    if (original.reversalOfId) {
      throw new BadRequestException(`Entry ${id} is itself a reversal entry and cannot be voided`);
    }

    const reversal = await tx.journalEntry.create({
      data: {
        sourceType: original.sourceType,
        sourceId: original.sourceId,
        memo: reason ? `Void: ${reason} (reversal of entry #${original.id})` : `Reversal of entry #${original.id}`,
        date: new Date(),
        reversalOfId: original.id,
        lines: {
          create: original.lines.map((l: any) => ({
            accountId: l.accountId,
            debit: l.credit,
            credit: l.debit,
            description: l.description,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });

    await tx.journalEntry.update({ where: { id: original.id }, data: { voidedAt: new Date() } });

    return reversal;
  }

  // A single customer's or supplier's slice of the AR/AP account — every posted line where
  // that party's name was tagged (invoices, payments), chronological with a running balance.
  async getPartnerLedger(partyType: 'CUSTOMER' | 'SUPPLIER', partyName: string) {
    const role = partyType === 'CUSTOMER' ? AccountMappingRole.ACCOUNTS_RECEIVABLE : AccountMappingRole.ACCOUNTS_PAYABLE;
    const account = await this.getMappedAccount(role);

    const lines = await this.prisma.journalLine.findMany({
      where: { accountId: account.id, partyType, partyName },
      include: { journalEntry: true },
      orderBy: { journalEntry: { date: 'asc' } },
    });

    // AR (Asset) increases on debit; AP (Liability) increases on credit.
    const increasesOnDebit = partyType === 'CUSTOMER';
    let runningBalance = 0;
    const rows = lines.map((line) => {
      runningBalance += increasesOnDebit ? line.debit - line.credit : line.credit - line.debit;
      return { ...line, runningBalance };
    });

    return { account, partyType, partyName, lines: rows, endingBalance: runningBalance };
  }

  private async sumForAccount(accountId: number, dateFilter?: { gte?: Date; lte?: Date }) {
    const { _sum } = await this.prisma.journalLine.aggregate({
      where: { accountId, ...(dateFilter && { journalEntry: { date: dateFilter } }) },
      _sum: { debit: true, credit: true },
    });
    return { debit: _sum.debit || 0, credit: _sum.credit || 0 };
  }

  async getTrialBalance(asOf?: string) {
    const dateFilter = asOf ? { lte: new Date(asOf + 'T23:59:59.999Z') } : undefined;
    const accounts = await this.prisma.account.findMany({ orderBy: { code: 'asc' } });

    const rows = await Promise.all(
      accounts.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, dateFilter);
        return { account, totalDebit: debit, totalCredit: credit, balance: debit - credit };
      }),
    );

    const nonZeroRows = rows.filter((r) => r.totalDebit !== 0 || r.totalCredit !== 0);
    return {
      rows: nonZeroRows,
      grandTotalDebit: nonZeroRows.reduce((s, r) => s + r.totalDebit, 0),
      grandTotalCredit: nonZeroRows.reduce((s, r) => s + r.totalCredit, 0),
    };
  }

  async getProfitAndLoss(from?: string, to?: string) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to + 'T23:59:59.999Z');
    const hasFilter = Object.keys(dateFilter).length > 0;

    const incomeAccounts = await this.prisma.account.findMany({ where: { type: 'INCOME' }, orderBy: { code: 'asc' } });
    const expenseAccounts = await this.prisma.account.findMany({ where: { type: 'EXPENSE' }, orderBy: { code: 'asc' } });

    // Income accounts are credit-normal; expense accounts are debit-normal.
    const incomeLines = await Promise.all(
      incomeAccounts.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, hasFilter ? dateFilter : undefined);
        return { account, amount: credit - debit };
      }),
    );
    const expenseLines = await Promise.all(
      expenseAccounts.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, hasFilter ? dateFilter : undefined);
        return { account, amount: debit - credit };
      }),
    );

    const totalIncome = incomeLines.reduce((s, l) => s + l.amount, 0);
    const totalExpense = expenseLines.reduce((s, l) => s + l.amount, 0);

    return { incomeLines, expenseLines, totalIncome, totalExpense, netProfit: totalIncome - totalExpense };
  }

  async getBalanceSheet(asOf?: string) {
    const dateFilter = asOf ? { lte: new Date(asOf + 'T23:59:59.999Z') } : undefined;

    const assets = await this.prisma.account.findMany({ where: { type: 'ASSET' }, orderBy: { code: 'asc' } });
    const liabilities = await this.prisma.account.findMany({ where: { type: 'LIABILITY' }, orderBy: { code: 'asc' } });
    const equity = await this.prisma.account.findMany({ where: { type: 'EQUITY' }, orderBy: { code: 'asc' } });

    const assetLines = await Promise.all(
      assets.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, dateFilter);
        return { account, amount: debit - credit }; // debit-normal
      }),
    );
    const liabilityLines = await Promise.all(
      liabilities.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, dateFilter);
        return { account, amount: credit - debit }; // credit-normal
      }),
    );
    const equityLines: { account: { id: number | null; code: string; name: string }; amount: number }[] = await Promise.all(
      equity.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, dateFilter);
        return { account, amount: credit - debit }; // credit-normal
      }),
    );

    // Income/Expense accounts don't post to Equity directly (no closing entry is made
    // per transaction) — without this, the balance sheet wouldn't satisfy
    // Assets = Liabilities + Equity until a period-end close. Instead, fold the
    // current, un-closed net income in as a synthetic "Retained Earnings" line, same
    // as most accounting software does for a live (non-closed) balance sheet.
    const { netProfit } = await this.getProfitAndLoss(undefined, asOf);
    equityLines.push({
      account: { id: null, code: '3900', name: 'Retained Earnings (current, unclosed)' },
      amount: netProfit,
    });

    return {
      assetLines,
      liabilityLines,
      equityLines,
      totalAssets: assetLines.reduce((s, l) => s + l.amount, 0),
      totalLiabilities: liabilityLines.reduce((s, l) => s + l.amount, 0),
      totalEquity: equityLines.reduce((s, l) => s + l.amount, 0),
    };
  }

  // One-call landing-page summary for the Accounting module — KPI strip + Sales/Purchase/
  // Payroll document-status cards + per-journal balance/posted-volume, all server-aggregated
  // (unlike the NEXYGEN ERP reference, which fires ~15 sequential per-account round trips from
  // the client — everything here is computed in this one request instead).
  async getDashboardSummary() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

    const [balanceSheet, mtdPL, journals, mappedAccounts] = await Promise.all([
      this.getBalanceSheet(),
      this.getProfitAndLoss(monthStart.toISOString()),
      this.prisma.journal.findMany({
        where: { isActive: true },
        include: { defaultDebitAccount: true, defaultCreditAccount: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.accountMapping.findMany({
        where: {
          role: {
            in: [
              AccountMappingRole.ACCOUNTS_RECEIVABLE,
              AccountMappingRole.ACCOUNTS_PAYABLE,
              AccountMappingRole.CASH_BANK,
              AccountMappingRole.SALARY_PAYABLE,
              AccountMappingRole.GRSIA_PAYABLE,
              AccountMappingRole.EOS_GRATUITY_ACCRUAL,
              AccountMappingRole.EMPLOYEE_ADVANCES_RECEIVABLE,
            ],
          },
        },
        include: { account: true },
      }),
    ]);

    const balanceLines = [...balanceSheet.assetLines, ...balanceSheet.liabilityLines];
    const amountByCode = (code: string) => balanceLines.find((l) => l.account.code === code)?.amount || 0;
    const accountIdFor = (role: AccountMappingRole) => mappedAccounts.find((m) => m.role === role)?.accountId;
    const amountByRole = (role: AccountMappingRole) => balanceLines.find((l) => l.account.id === accountIdFor(role))?.amount || 0;

    const kpis = {
      receivables: amountByRole(AccountMappingRole.ACCOUNTS_RECEIVABLE),
      payables: amountByRole(AccountMappingRole.ACCOUNTS_PAYABLE),
      // '1010' Bank is a fixed system account (not itself a mapped role — only reachable via an
      // explicit Journal override) summed alongside whatever the CASH_BANK role currently resolves to.
      cashAndBank: amountByRole(AccountMappingRole.CASH_BANK) + amountByCode('1010'),
      mtdNetIncome: mtdPL.netProfit,
    };

    const payroll = {
      salaryPayable: amountByRole(AccountMappingRole.SALARY_PAYABLE),
      grsiaPayable: amountByRole(AccountMappingRole.GRSIA_PAYABLE),
      eosGratuityAccrual: amountByRole(AccountMappingRole.EOS_GRATUITY_ACCRUAL),
      employeeAdvances: amountByRole(AccountMappingRole.EMPLOYEE_ADVANCES_RECEIVABLE),
    };

    const [
      invoiceCounts,
      billCounts,
      invoiceOutstanding,
      billOutstanding,
      invoiceOverdue,
      billOverdue,
      draftRuns,
      unpaidRuns,
    ] = await Promise.all([
      this.prisma.invoice.groupBy({ by: ['paymentStatus'], _count: true }),
      this.prisma.bill.groupBy({ by: ['paymentStatus'], _count: true }),
      this.prisma.invoice.aggregate({ where: { paymentStatus: { not: 'PAID' } }, _sum: { totalAmount: true, amountPaid: true } }),
      this.prisma.bill.aggregate({ where: { paymentStatus: { not: 'PAID' } }, _sum: { totalAmount: true, amountPaid: true } }),
      this.prisma.invoice.aggregate({ where: { paymentStatus: { not: 'PAID' }, createdAt: { lt: sixtyDaysAgo } }, _sum: { totalAmount: true, amountPaid: true }, _count: true }),
      this.prisma.bill.aggregate({ where: { paymentStatus: { not: 'PAID' }, createdAt: { lt: sixtyDaysAgo } }, _sum: { totalAmount: true, amountPaid: true }, _count: true }),
      this.prisma.payrollRun.count({ where: { status: 'DRAFT' } }),
      this.prisma.payrollRun.count({ where: { status: 'PROCESSED' } }),
    ]);

    const countFor = (rows: { paymentStatus: string; _count: number }[], status: string) =>
      rows.find((r) => r.paymentStatus === status)?._count || 0;

    const docSummary = (
      counts: typeof invoiceCounts,
      outstanding: typeof invoiceOutstanding,
      overdue: typeof invoiceOverdue,
    ) => ({
      unpaid: countFor(counts, 'UNPAID'),
      partial: countFor(counts, 'PARTIAL'),
      paid: countFor(counts, 'PAID'),
      outstandingAmount: (outstanding._sum.totalAmount || 0) - (outstanding._sum.amountPaid || 0),
      overdueCount: overdue._count,
      overdueAmount: (overdue._sum.totalAmount || 0) - (overdue._sum.amountPaid || 0),
    });

    const journalRows = await Promise.all(
      journals.map(async (j) => {
        if (j.type === 'CASH' || j.type === 'BANK') {
          const amount = j.defaultDebitAccount ? amountByCode(j.defaultDebitAccount.code) : 0;
          return { journal: j, amount, isBalance: true };
        }
        const { _sum } = await this.prisma.journalLine.aggregate({
          where: { journalEntry: { journalId: j.id } },
          _sum: { debit: true },
        });
        return { journal: j, amount: _sum.debit || 0, isBalance: false };
      }),
    );

    return {
      kpis,
      salesInvoices: docSummary(invoiceCounts, invoiceOutstanding, invoiceOverdue),
      purchaseBills: docSummary(billCounts, billOutstanding, billOverdue),
      payroll: { ...payroll, draftRuns, unpaidRuns },
      journals: journalRows,
    };
  }
}

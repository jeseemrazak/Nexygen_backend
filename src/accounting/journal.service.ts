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
        | 'POS_SESSION_VARIANCE'
        | 'SALES_DELIVERY_COGS'
        | 'SALES_DELIVERY_RETURN'
        | 'PURCHASE_RECEIPT_RETURN'
        | 'PAYROLL_RUN'
        | 'PAYROLL_DISBURSEMENT'
        | 'LOAN_ISSUANCE'
        | 'EOS_ACCRUAL'
        | 'STOCK_ADJUSTMENT'
        | 'RESTAURANT_TIP';
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
        costCenterId?: number;
        warehouseId?: number;
      }[];
    },
  ) {
    const totalDebit = params.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredit = params.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new BadRequestException(`Journal entry is unbalanced: debits ${totalDebit} != credits ${totalCredit}`);
    }

    const entryDate = params.date ?? new Date();
    await this.assertFiscalYearOpen(tx, entryDate);

    return tx.journalEntry.create({
      data: {
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        memo: params.memo,
        date: entryDate,
        journalId: params.journalId,
        lines: {
          create: params.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit || 0,
            credit: l.credit || 0,
            description: l.description,
            partyType: l.partyType,
            partyName: l.partyName,
            costCenterId: l.costCenterId,
            warehouseId: l.warehouseId,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
  }

  // Every posting path (auto-posted or manual, forward entry or void reversal) funnels through
  // here or voidEntryInTx — one choke point means "no journal entry lands inside a locked fiscal
  // year" holds everywhere, not just on the manual-entry form.
  private async assertFiscalYearOpen(tx: any, date: Date) {
    const lockedYear = await tx.fiscalYear.findFirst({
      where: { status: 'LOCKED', startDate: { lte: date }, endDate: { gte: date } },
    });
    if (lockedYear) {
      throw new BadRequestException(`Fiscal year "${lockedYear.name}" is locked — this date can no longer be posted to.`);
    }
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

    const reversalDate = new Date();
    await this.assertFiscalYearOpen(tx, reversalDate);

    const reversal = await tx.journalEntry.create({
      data: {
        sourceType: original.sourceType,
        sourceId: original.sourceId,
        memo: reason ? `Void: ${reason} (reversal of entry #${original.id})` : `Reversal of entry #${original.id}`,
        date: reversalDate,
        reversalOfId: original.id,
        lines: {
          create: original.lines.map((l: any) => ({
            accountId: l.accountId,
            debit: l.credit,
            credit: l.debit,
            description: l.description,
            partyType: l.partyType,
            partyName: l.partyName,
            costCenterId: l.costCenterId,
            warehouseId: l.warehouseId,
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

  // warehouseId is optional and, when passed, scopes the sum to lines from that outlet only.
  // This works cleanly because every posting site that ever sets JournalLine.warehouseId tags
  // ALL of an entry's lines with the same warehouseId (never just one leg) — so filtering by
  // warehouseId always selects whole, already-balanced entries, and any aggregate built from
  // sumForAccount(..., warehouseId) stays internally consistent (debits still equal credits).
  private async sumForAccount(accountId: number, dateFilter?: { gte?: Date; lte?: Date }, warehouseId?: number) {
    const { _sum } = await this.prisma.journalLine.aggregate({
      where: { accountId, ...(dateFilter && { journalEntry: { date: dateFilter } }), ...(warehouseId && { warehouseId }) },
      _sum: { debit: true, credit: true },
    });
    return { debit: _sum.debit || 0, credit: _sum.credit || 0 };
  }

  // Optional warehouseId scopes this to one outlet's activity — see sumForAccount's comment for
  // why the result still balances. Purchases/Payroll/Manual/Expense postings never carry a
  // warehouseId, so they simply disappear from a warehouse-filtered trial balance (as expected —
  // they aren't that outlet's activity), not because anything was dropped in error.
  async getTrialBalance(asOf?: string, warehouseId?: number) {
    const dateFilter = asOf ? { lte: new Date(asOf + 'T23:59:59.999Z') } : undefined;
    const accounts = await this.prisma.account.findMany({ orderBy: { code: 'asc' } });

    const rows = await Promise.all(
      accounts.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, dateFilter, warehouseId);
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

  async getProfitAndLoss(from?: string, to?: string, warehouseId?: number) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to + 'T23:59:59.999Z');
    const hasFilter = Object.keys(dateFilter).length > 0;

    const incomeAccounts = await this.prisma.account.findMany({ where: { type: 'INCOME' }, orderBy: { code: 'asc' } });
    const expenseAccounts = await this.prisma.account.findMany({ where: { type: 'EXPENSE' }, orderBy: { code: 'asc' } });

    // Income accounts are credit-normal; expense accounts are debit-normal.
    const incomeLines = await Promise.all(
      incomeAccounts.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, hasFilter ? dateFilter : undefined, warehouseId);
        return { account, amount: credit - debit };
      }),
    );
    const expenseLines = await Promise.all(
      expenseAccounts.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, hasFilter ? dateFilter : undefined, warehouseId);
        return { account, amount: debit - credit };
      }),
    );

    const totalIncome = incomeLines.reduce((s, l) => s + l.amount, 0);
    const totalExpense = expenseLines.reduce((s, l) => s + l.amount, 0);

    return { incomeLines, expenseLines, totalIncome, totalExpense, netProfit: totalIncome - totalExpense };
  }

  // Same INCOME/EXPENSE accounts as getProfitAndLoss, but broken out per Warehouse (the "outlet"
  // dimension) using JournalLine.warehouseId — only POS sales, Sales Invoices, and Delivery
  // COGS/returns ever set that column, so Purchases/Payroll/Manual/Expense lines (which never
  // do) all land in a single "Unassigned" bucket rather than being silently dropped. Column
  // totals always sum to exactly the same figures getProfitAndLoss returns for the same range.
  async getOutletProfitAndLoss(from?: string, to?: string) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to + 'T23:59:59.999Z');
    const hasFilter = Object.keys(dateFilter).length > 0;

    const warehouses = await this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
    const incomeAccounts = await this.prisma.account.findMany({ where: { type: 'INCOME' }, orderBy: { code: 'asc' } });
    const expenseAccounts = await this.prisma.account.findMany({ where: { type: 'EXPENSE' }, orderBy: { code: 'asc' } });

    const buildRow = async (account: { id: number; code: string; name: string }, sign: 1 | -1) => {
      const lines = await this.prisma.journalLine.groupBy({
        by: ['warehouseId'],
        where: { accountId: account.id, ...(hasFilter && { journalEntry: { date: dateFilter } }) },
        _sum: { debit: true, credit: true },
      });
      const byWarehouseId: Record<string, number> = {};
      let unassigned = 0;
      for (const l of lines) {
        // sign=1 (income, credit-normal): amount = credit - debit. sign=-1 (expense, debit-normal): amount = debit - credit.
        const normalized = sign === 1 ? (l._sum.credit || 0) - (l._sum.debit || 0) : (l._sum.debit || 0) - (l._sum.credit || 0);
        if (l.warehouseId === null) unassigned += normalized;
        else byWarehouseId[l.warehouseId] = normalized;
      }
      const total = Object.values(byWarehouseId).reduce((s, v) => s + v, 0) + unassigned;
      return { account, byWarehouseId, unassigned, total };
    };

    const incomeRows = await Promise.all(incomeAccounts.map((a) => buildRow(a, 1)));
    const expenseRows = await Promise.all(expenseAccounts.map((a) => buildRow(a, -1)));

    const sumColumn = (rows: typeof incomeRows, warehouseId: number | null) =>
      rows.reduce((s, r) => s + (warehouseId === null ? r.unassigned : r.byWarehouseId[warehouseId] || 0), 0);

    const columns = [...warehouses.map((w) => ({ id: w.id, name: w.name })), { id: null, name: 'Unassigned' }];
    const netByColumn = columns.map((c) => ({
      ...c,
      income: sumColumn(incomeRows, c.id),
      expense: sumColumn(expenseRows, c.id),
      net: sumColumn(incomeRows, c.id) - sumColumn(expenseRows, c.id),
    }));

    return {
      warehouses: columns,
      incomeRows,
      expenseRows,
      netByColumn,
      totalIncome: incomeRows.reduce((s, r) => s + r.total, 0),
      totalExpense: expenseRows.reduce((s, r) => s + r.total, 0),
      netProfit: incomeRows.reduce((s, r) => s + r.total, 0) - expenseRows.reduce((s, r) => s + r.total, 0),
    };
  }

  // Optional warehouseId scopes this to one outlet's activity. Real Equity accounts (Owner's
  // Equity etc.) are never touched by warehouse-tagged entries — only Cash/AR/Inventory/Revenue/
  // COGS/Tax lines from POS/Invoice/Delivery postings are — so a warehouse-filtered balance sheet
  // still satisfies Assets = Liabilities + Equity: real equity lines come back at 0, and the
  // synthetic Retained Earnings line (below) carries the warehouse-scoped net income instead.
  async getBalanceSheet(asOf?: string, warehouseId?: number) {
    const dateFilter = asOf ? { lte: new Date(asOf + 'T23:59:59.999Z') } : undefined;

    const assets = await this.prisma.account.findMany({ where: { type: 'ASSET' }, orderBy: { code: 'asc' } });
    const liabilities = await this.prisma.account.findMany({ where: { type: 'LIABILITY' }, orderBy: { code: 'asc' } });
    const equity = await this.prisma.account.findMany({ where: { type: 'EQUITY' }, orderBy: { code: 'asc' } });

    const assetLines = await Promise.all(
      assets.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, dateFilter, warehouseId);
        return { account, amount: debit - credit }; // debit-normal
      }),
    );
    const liabilityLines = await Promise.all(
      liabilities.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, dateFilter, warehouseId);
        return { account, amount: credit - debit }; // credit-normal
      }),
    );
    const equityLines: { account: { id: number | null; code: string; name: string }; amount: number }[] = await Promise.all(
      equity.map(async (account) => {
        const { debit, credit } = await this.sumForAccount(account.id, dateFilter, warehouseId);
        return { account, amount: credit - debit }; // credit-normal
      }),
    );

    // Income/Expense accounts don't post to Equity directly (no closing entry is made
    // per transaction) — without this, the balance sheet wouldn't satisfy
    // Assets = Liabilities + Equity until a period-end close. Instead, fold the
    // current, un-closed net income in as a synthetic "Retained Earnings" line, same
    // as most accounting software does for a live (non-closed) balance sheet.
    const { netProfit } = await this.getProfitAndLoss(undefined, asOf, warehouseId);
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

  // Indirect-method Cash Flow Statement for [from, to]. Built entirely from balance-sheet-account
  // deltas rather than a hand-maintained cash ledger, so it's guaranteed to reconcile: because
  // getBalanceSheet() always folds in-progress net income as a synthetic Equity line, the
  // accounting identity Assets = Liabilities + Equity holds at any two points in time, which
  // algebraically forces (Operating + Investing + Financing) to equal the period's actual
  // Cash+Bank movement — `reconciles` below is a live proof of that, not just a display figure.
  async getCashFlowStatement(from: string, to: string) {
    if (!from || !to) {
      throw new BadRequestException('from and to dates are required for the Cash Flow Statement');
    }
    const openingAsOf = new Date(new Date(from).getTime() - 1);
    const closingAsOf = new Date(to + 'T23:59:59.999Z');

    const cashBankAccount = await this.getMappedAccount(AccountMappingRole.CASH_BANK);
    const bankFixed = await this.prisma.account.findUnique({ where: { code: '1010' } });
    const cashAccountIds = Array.from(new Set([cashBankAccount.id, ...(bankFixed ? [bankFixed.id] : [])]));

    const { netProfit } = await this.getProfitAndLoss(from, to);

    const assets = await this.prisma.account.findMany({ where: { type: 'ASSET' } });
    const liabilities = await this.prisma.account.findMany({ where: { type: 'LIABILITY' } });
    const equity = await this.prisma.account.findMany({ where: { type: 'EQUITY' } });

    const balanceAt = async (accountId: number, debitNormal: boolean, asOf: Date) => {
      const { debit, credit } = await this.sumForAccount(accountId, { lte: asOf });
      return debitNormal ? debit - credit : credit - debit;
    };

    const buildLine = async (account: { id: number; code: string; name: string }, debitNormal: boolean, cashImpactSign: 1 | -1) => {
      const opening = await balanceAt(account.id, debitNormal, openingAsOf);
      const closing = await balanceAt(account.id, debitNormal, closingAsOf);
      const change = closing - opening;
      return { account, change, cashImpact: cashImpactSign * change };
    };

    // Operating: net income + working-capital changes (increase in a non-cash asset consumes
    // cash; increase in a liability frees it up) — every current-ish ASSET/LIABILITY account
    // except cash-equivalents and Fixed Assets (which is Investing, below).
    const operatingLines = [
      ...(await Promise.all(
        assets
          .filter((a) => !cashAccountIds.includes(a.id) && a.subtype !== 'Non-current Asset')
          .map((a) => buildLine(a, true, -1)),
      )),
      ...(await Promise.all(liabilities.map((a) => buildLine(a, false, 1)))),
    ];

    // Investing: Fixed Assets (1500) — an increase is a cash outflow (equipment purchased).
    const investingLines = await Promise.all(
      assets.filter((a) => a.subtype === 'Non-current Asset' && !cashAccountIds.includes(a.id)).map((a) => buildLine(a, true, -1)),
    );

    // Financing: real Equity accounts (e.g. Owner's Equity) — the synthetic "Retained Earnings"
    // line getBalanceSheet() adds isn't a real account (id: null) so it never appears here; its
    // movement is exactly `netProfit`, already counted at the top of Operating.
    const financingLines = await Promise.all(equity.map((a) => buildLine(a, false, 1)));

    const netCashFromOperating = netProfit + operatingLines.reduce((s, l) => s + l.cashImpact, 0);
    const netCashFromInvesting = investingLines.reduce((s, l) => s + l.cashImpact, 0);
    const netCashFromFinancing = financingLines.reduce((s, l) => s + l.cashImpact, 0);
    const netChangeInCash = netCashFromOperating + netCashFromInvesting + netCashFromFinancing;

    let openingCash = 0;
    let closingCash = 0;
    for (const id of cashAccountIds) {
      openingCash += await balanceAt(id, true, openingAsOf);
      closingCash += await balanceAt(id, true, closingAsOf);
    }
    const actualCashMovement = closingCash - openingCash;

    return {
      from,
      to,
      netProfit,
      operatingLines,
      netCashFromOperating,
      investingLines,
      netCashFromInvesting,
      financingLines,
      netCashFromFinancing,
      netChangeInCash,
      openingCash,
      closingCash,
      actualCashMovement,
      reconciles: Math.abs(netChangeInCash - actualCashMovement) < 0.01,
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

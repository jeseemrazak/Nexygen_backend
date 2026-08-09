import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { JournalService } from './journal.service';
import { AgingService } from './aging.service';
import { FxRevaluationService } from './fx-revaluation.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { VoidJournalEntryDto } from './dto/void-journal-entry.dto';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN')
@Controller('accounting')
export class JournalController {
  constructor(
    private readonly journalService: JournalService,
    private readonly agingService: AgingService,
    private readonly fxRevaluationService: FxRevaluationService,
  ) {}

  @Post('journal-entries')
  createManualEntry(@Body() dto: CreateJournalEntryDto) {
    return this.journalService.createManualEntry(dto);
  }

  @Get('journal-entries')
  findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('journalId') journalId?: string,
    @Query('sourceType') sourceType?: string,
    @Query('search') search?: string,
  ) {
    return this.journalService.findAll({
      from,
      to,
      accountId: accountId ? Number(accountId) : undefined,
      journalId: journalId ? Number(journalId) : undefined,
      sourceType,
      search,
    });
  }

  @Get('dashboard')
  getDashboardSummary() {
    return this.journalService.getDashboardSummary();
  }

  @Get('journal-entries/:id')
  findOne(@Param('id') id: string) {
    return this.journalService.findOne(+id);
  }

  @Post('journal-entries/:id/void')
  voidEntry(@Param('id') id: string, @Body() dto: VoidJournalEntryDto) {
    return this.journalService.voidEntry(+id, dto.reason);
  }

  @Get('reports/ar-aging')
  getArAging(@Query('asOf') asOf?: string) {
    return this.agingService.getArAging(asOf);
  }

  @Get('reports/ap-aging')
  getApAging(@Query('asOf') asOf?: string) {
    return this.agingService.getApAging(asOf);
  }

  @Get('trial-balance')
  getTrialBalance(@Query('asOf') asOf?: string, @Query('warehouseId') warehouseId?: string) {
    return this.journalService.getTrialBalance(asOf, warehouseId ? Number(warehouseId) : undefined);
  }

  @Get('reports/profit-loss')
  getProfitAndLoss(@Query('from') from?: string, @Query('to') to?: string, @Query('warehouseId') warehouseId?: string) {
    return this.journalService.getProfitAndLoss(from, to, warehouseId ? Number(warehouseId) : undefined);
  }

  @Get('reports/balance-sheet')
  getBalanceSheet(@Query('asOf') asOf?: string, @Query('warehouseId') warehouseId?: string) {
    return this.journalService.getBalanceSheet(asOf, warehouseId ? Number(warehouseId) : undefined);
  }

  @Get('reports/outlet-pnl')
  getOutletProfitAndLoss(@Query('from') from?: string, @Query('to') to?: string) {
    return this.journalService.getOutletProfitAndLoss(from, to);
  }

  @Get('reports/cash-flow')
  getCashFlowStatement(@Query('from') from: string, @Query('to') to: string) {
    return this.journalService.getCashFlowStatement(from, to);
  }

  @Get('reports/fx-revaluation')
  getFxRevaluation() {
    return this.fxRevaluationService.getFxRevaluation();
  }

  @Get('partner-ledger')
  getPartnerLedger(@Query('partyType') partyType: 'CUSTOMER' | 'SUPPLIER', @Query('partyName') partyName: string) {
    return this.journalService.getPartnerLedger(partyType, partyName);
  }
}

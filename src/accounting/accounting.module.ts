import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { JournalService } from './journal.service';
import { AgingService } from './aging.service';
import { JournalsService } from './journals.service';
import { PaymentMethodsService } from './payment-methods.service';
import { AccountMappingsService } from './account-mappings.service';
import { TaxesService } from './taxes.service';
import { PaymentTermsService } from './payment-terms.service';
import { CostCentersService } from './cost-centers.service';
import { FiscalYearsService } from './fiscal-years.service';
import { CurrenciesService } from './currencies.service';
import { FxRevaluationService } from './fx-revaluation.service';
import { AccountsController } from './accounts.controller';
import { JournalController } from './journal.controller';
import { JournalsController } from './journals.controller';
import { PaymentMethodsController } from './payment-methods.controller';
import { AccountMappingsController } from './account-mappings.controller';
import { TaxesController } from './taxes.controller';
import { PaymentTermsController } from './payment-terms.controller';
import { CostCentersController } from './cost-centers.controller';
import { FiscalYearsController } from './fiscal-years.controller';
import { CurrenciesController } from './currencies.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [
    AccountsController,
    JournalController,
    JournalsController,
    PaymentMethodsController,
    AccountMappingsController,
    TaxesController,
    PaymentTermsController,
    CostCentersController,
    FiscalYearsController,
    CurrenciesController,
  ],
  providers: [
    AccountsService,
    JournalService,
    AgingService,
    JournalsService,
    PaymentMethodsService,
    AccountMappingsService,
    TaxesService,
    PaymentTermsService,
    CostCentersService,
    FiscalYearsService,
    CurrenciesService,
    FxRevaluationService,
    PrismaService,
  ],
  exports: [JournalService],
})
export class AccountingModule {}

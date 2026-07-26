import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { JournalService } from './journal.service';
import { AgingService } from './aging.service';
import { JournalsService } from './journals.service';
import { PaymentMethodsService } from './payment-methods.service';
import { AccountMappingsService } from './account-mappings.service';
import { AccountsController } from './accounts.controller';
import { JournalController } from './journal.controller';
import { JournalsController } from './journals.controller';
import { PaymentMethodsController } from './payment-methods.controller';
import { AccountMappingsController } from './account-mappings.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AccountsController, JournalController, JournalsController, PaymentMethodsController, AccountMappingsController],
  providers: [AccountsService, JournalService, AgingService, JournalsService, PaymentMethodsService, AccountMappingsService, PrismaService],
  exports: [JournalService],
})
export class AccountingModule {}

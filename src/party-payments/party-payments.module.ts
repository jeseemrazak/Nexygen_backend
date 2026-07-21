import { Module } from '@nestjs/common';
import { PartyPaymentsService } from './party-payments.service';
import { PartyPaymentsController } from './party-payments.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [PartyPaymentsController],
  providers: [PartyPaymentsService, PrismaService],
})
export class PartyPaymentsModule {}

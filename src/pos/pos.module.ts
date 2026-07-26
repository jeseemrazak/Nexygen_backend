import { Module } from '@nestjs/common';
import { PosStaffService } from './pos-staff.service';
import { PosStaffController } from './pos-staff.controller';
import { PosSessionsService } from './pos-sessions.service';
import { PosSessionsController } from './pos-sessions.controller';
import { PosSalesService } from './pos-sales.service';
import { PosSalesController } from './pos-sales.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [AccountingModule, NotificationsModule, LoyaltyModule],
  controllers: [PosStaffController, PosSessionsController, PosSalesController],
  providers: [PosStaffService, PosSessionsService, PosSalesService, PrismaService],
})
export class PosModule {}

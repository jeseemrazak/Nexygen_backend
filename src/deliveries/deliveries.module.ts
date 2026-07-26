import { Module } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AccountingModule, NotificationsModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, PrismaService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}

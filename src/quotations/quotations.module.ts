import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { PrismaService } from '../prisma/prisma.service';
import { SalesOrdersModule } from '../sales-orders/sales-orders.module';

@Module({
  imports: [SalesOrdersModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, PrismaService],
})
export class QuotationsModule {}

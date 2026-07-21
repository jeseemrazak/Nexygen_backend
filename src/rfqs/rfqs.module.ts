import { Module } from '@nestjs/common';
import { RfqsService } from './rfqs.service';
import { RfqsController } from './rfqs.controller';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';

@Module({
  imports: [PurchaseOrdersModule],
  controllers: [RfqsController],
  providers: [RfqsService, PrismaService],
})
export class RfqsModule {}

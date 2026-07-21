import { Module } from '@nestjs/common';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrdersController } from './sales-orders.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService, PrismaService],
  exports: [SalesOrdersService],
})
export class SalesOrdersModule {}

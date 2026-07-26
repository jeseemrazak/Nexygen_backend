import { Module } from '@nestjs/common';
import { JobOrdersService } from './job-orders.service';
import { JobOrdersController } from './job-orders.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [JobOrdersController],
  providers: [JobOrdersService, PrismaService],
  exports: [JobOrdersService],
})
export class JobOrdersModule {}

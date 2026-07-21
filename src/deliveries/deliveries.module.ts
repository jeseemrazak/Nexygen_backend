import { Module } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [DeliveriesController],
  providers: [DeliveriesService, PrismaService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}

import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryStatus } from '@prisma/client';

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly service: DeliveriesService) {}

  @Post()
  create(@Body() dto: CreateDeliveryDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('salesOrderId') salesOrderId?: string) {
    return this.service.findAll(salesOrderId ? +salesOrderId : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: DeliveryStatus) {
    return this.service.updateStatus(+id, status);
  }
}

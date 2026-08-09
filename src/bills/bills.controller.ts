import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { BillsService } from './bills.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { RecordBillPaymentDto } from './dto/record-bill-payment.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('bills')
export class BillsController {
  constructor(private readonly service: BillsService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateBillDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('purchaseOrderId') purchaseOrderId?: string) {
    return this.service.findAll(purchaseOrderId ? +purchaseOrderId : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Roles('ADMIN')
  @Post(':id/payments')
  recordPayment(@Param('id') id: string, @Body() dto: RecordBillPaymentDto) {
    return this.service.recordPayment(+id, dto);
  }

  @Roles('ADMIN')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.service.cancel(+id, reason);
  }
}

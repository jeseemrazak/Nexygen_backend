import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateInvoiceDto) {
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

  @Roles('ADMIN')
  @Post(':id/payments')
  recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.service.recordPayment(+id, dto);
  }

  @Roles('ADMIN')
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.service.cancel(+id, reason);
  }
}

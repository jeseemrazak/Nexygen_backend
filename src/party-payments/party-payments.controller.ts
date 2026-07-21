import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PartyPaymentsService } from './party-payments.service';
import { CreatePartyPaymentDto } from './dto/create-party-payment.dto';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN')
@Controller('accounting/payments')
export class PartyPaymentsController {
  constructor(private readonly service: PartyPaymentsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() dto: CreatePartyPaymentDto) {
    return this.service.create(dto);
  }

  @Get('open/invoices')
  getOpenInvoices(@Query('customerName') customerName?: string) {
    return this.service.getOpenInvoices(customerName);
  }

  @Get('open/bills')
  getOpenBills(@Query('supplierName') supplierName?: string) {
    return this.service.getOpenBills(supplierName);
  }
}

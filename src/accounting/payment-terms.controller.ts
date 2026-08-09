import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { PaymentTermsService } from './payment-terms.service';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN')
@Controller('accounting/payment-terms')
export class PaymentTermsController {
  constructor(private readonly paymentTermsService: PaymentTermsService) {}

  @Post()
  create(@Body() dto: CreatePaymentTermDto) {
    return this.paymentTermsService.create(dto);
  }

  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.paymentTermsService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentTermsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentTermDto) {
    return this.paymentTermsService.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentTermsService.remove(+id);
  }
}

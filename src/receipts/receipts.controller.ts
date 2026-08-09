import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { ReturnReceiptDto } from './dto/return-receipt.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly service: ReceiptsService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateReceiptDto) {
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
  @Post(':id/returns')
  returnItems(@Param('id') id: string, @Body() dto: ReturnReceiptDto) {
    return this.service.returnItems(+id, dto);
  }
}

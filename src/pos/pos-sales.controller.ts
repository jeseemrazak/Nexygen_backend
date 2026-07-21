import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PosSalesService } from './pos-sales.service';
import { CreatePosSaleDto } from './dto/create-pos-sale.dto';
import { CancelPosSaleDto } from './dto/cancel-pos-sale.dto';

@Controller('pos-sales')
export class PosSalesController {
  constructor(private readonly service: PosSalesService) {}

  @Post()
  create(@Body() dto: CreatePosSaleDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('sessionId') sessionId?: string) {
    return this.service.findAll(sessionId ? +sessionId : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelPosSaleDto) {
    return this.service.cancel(+id, dto.reason, dto.cancelledById);
  }
}

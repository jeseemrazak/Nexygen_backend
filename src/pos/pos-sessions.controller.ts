import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PosSessionsService } from './pos-sessions.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';

@Controller('pos-sessions')
export class PosSessionsController {
  constructor(private readonly service: PosSessionsService) {}

  @Post()
  open(@Body() dto: OpenSessionDto) {
    return this.service.open(dto);
  }

  @Post(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseSessionDto) {
    return this.service.close(+id, dto);
  }

  @Get()
  findAll(@Query('warehouseId') warehouseId?: string) {
    return this.service.findAll(warehouseId ? +warehouseId : undefined);
  }

  @Get('open')
  findOpenForWarehouse(@Query('warehouseId') warehouseId: string) {
    return this.service.findOpenForWarehouse(+warehouseId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
}

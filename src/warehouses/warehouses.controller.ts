import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { Roles } from '../auth/roles.decorator';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() createWarehouseDto: { name: string; location?: string }) {
    return this.warehousesService.create(createWarehouseDto);
  }

  @Get()
  findAll() {
    return this.warehousesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(+id);
  }
}
import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UnitsOfMeasurementService } from './units-of-measurement.service';
import { CreateUnitOfMeasurementDto } from './dto/create-unit-of-measurement.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('units-of-measurement')
export class UnitsOfMeasurementController {
  constructor(private readonly service: UnitsOfMeasurementService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateUnitOfMeasurementDto) {
    return this.service.create(dto);
  }

  // Open to any authenticated role — the Products "new"/"edit" pickers all need to read this list.
  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly === 'true');
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateUnitOfMeasurementDto>) {
    return this.service.update(+id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}

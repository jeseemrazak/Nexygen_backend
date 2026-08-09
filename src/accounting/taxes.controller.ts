import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { TaxesService } from './taxes.service';
import { CreateTaxDto } from './dto/create-tax.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN')
@Controller('accounting/taxes')
export class TaxesController {
  constructor(private readonly taxesService: TaxesService) {}

  @Post()
  create(@Body() dto: CreateTaxDto) {
    return this.taxesService.create(dto);
  }

  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.taxesService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.taxesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaxDto) {
    return this.taxesService.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.taxesService.remove(+id);
  }
}

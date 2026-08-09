import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { FiscalYearsService } from './fiscal-years.service';
import { CreateFiscalYearDto } from './dto/create-fiscal-year.dto';
import { Roles } from '../auth/roles.decorator';

@Roles('ADMIN')
@Controller('accounting/fiscal-years')
export class FiscalYearsController {
  constructor(private readonly fiscalYearsService: FiscalYearsService) {}

  @Post()
  create(@Body() dto: CreateFiscalYearDto) {
    return this.fiscalYearsService.create(dto);
  }

  @Get()
  findAll() {
    return this.fiscalYearsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fiscalYearsService.findOne(+id);
  }

  @Post(':id/lock')
  lock(@Param('id') id: string) {
    return this.fiscalYearsService.lock(+id);
  }

  @Post(':id/unlock')
  unlock(@Param('id') id: string) {
    return this.fiscalYearsService.unlock(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.fiscalYearsService.remove(+id);
  }
}

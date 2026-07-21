import { Controller, Get, Post, Body, Patch, Param, Query } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationStatusDto } from './dto/update-quotation-status.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() createQuotationDto: CreateQuotationDto) {
    return this.quotationsService.create(createQuotationDto);
  }

  @Get()
  findAll(@Query('status') status?: string) {
    return this.quotationsService.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quotationsService.findOne(+id);
  }

  @Roles('ADMIN')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateQuotationStatusDto) {
    return this.quotationsService.updateStatus(+id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/convert')
  convert(@Param('id') id: string) {
    return this.quotationsService.convert(+id);
  }
}

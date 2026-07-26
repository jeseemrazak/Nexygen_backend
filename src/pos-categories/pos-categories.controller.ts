import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { PosCategoriesService } from './pos-categories.service';
import { CreatePosCategoryDto } from './dto/create-pos-category.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('pos-categories')
export class PosCategoriesController {
  constructor(private readonly service: PosCategoriesService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreatePosCategoryDto) {
    return this.service.create(dto);
  }

  // Open to any authenticated role — the POS checkout screen needs this for anyone running the till.
  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly === 'true');
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreatePosCategoryDto>) {
    return this.service.update(+id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}

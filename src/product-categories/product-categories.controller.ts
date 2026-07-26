import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ProductCategoriesService } from './product-categories.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) {}

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateProductCategoryDto) {
    return this.service.create(dto);
  }

  // Open to any authenticated role — the Products "new"/"edit" pickers and (indirectly, via
  // Product.category) reporting views all need to read this list, not just admins.
  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly === 'true');
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateProductCategoryDto>) {
    return this.service.update(+id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}

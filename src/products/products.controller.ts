import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Roles('ADMIN')
  @Post()
  async create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }
// 🔥 ADVANCED IMPORT ROUTE
  @Roles('ADMIN')
  @Post('import')
  async importProducts(@Body() body: { products: any[], warehouseId?: number }) {
    // We pass the warehouseId from the frontend, or it defaults to 1
    return this.productsService.importProducts(body.products, body.warehouseId);
  }

  // 🚚 NEW TRANSFER ROUTE
  @Roles('ADMIN')
  @Post('transfer')
  async transferStock(@Body() body: any) {
    return this.productsService.transferStock(body);
  }
// 📜 GET MOVEMENT HISTORY
  @Get('movements')
  async getStockMovements() {
    return this.productsService.getStockMovements();
  }
  @Get()
  async findAll() {
    return this.productsService.findAll();
  }

  // 🔥 MUST BE ABOVE :id ROUTE
  @Get('search')
  search(@Query('q') q: string) {
    if (!q) return [];
    return this.productsService.searchProducts(q);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(+id);
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(+id, updateProductDto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.productsService.remove(+id);
  }
}
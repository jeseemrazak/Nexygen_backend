import { Controller, Get, Patch, Param, Body, Post } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('valuation')
  getValuation() {
    return this.inventoryService.getValuationByWarehouse();
  }

  @Roles('ADMIN')
  @Post('receive')
  addStock(@Body() body: ReceiveStockDto) {
    return this.inventoryService.addStock(
      body.warehouseId, 
      body.productId, 
      body.quantity, 
      body.batchNumber, 
      body.expiryDate
    );
  }

  // 🔥 UPDATED: Generic PATCH route to handle any inventory batch update by ID
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { 
    quantity?: number; 
    batchNumber?: string; 
    expiryDate?: string | null 
  }) {
    return this.inventoryService.update(Number(id), {
      quantity: body.quantity,
      batchNumber: body.batchNumber,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
    });
  }
}
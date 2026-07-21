import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // 1. GET ALL STOCK FOR A WAREHOUSE
  async getStockByWarehouse(warehouseId: number) {
    return this.prisma.inventory.findMany({
      where: { warehouseId },
      include: { product: true }, // Pulls in the product name and details!
    });
  }

  // 2. ADD STOCK (Receiving a shipment)
  // 🔥 NEW: Now accepts batchNumber and expiryDate

  async addStock(
    warehouseId: number, 
    productId: number, 
    quantityToAdd: number,
    batchNumber: string,
    expiryDate?: string
  ) {
    if (quantityToAdd <= 0) throw new BadRequestException('Must add a positive amount');

    // UPSERT will look for this exact product/warehouse/batch combo.
    // If it finds it, it INCREMENTS the quantity.
    // If it DOESN'T find it, it CREATES a new row for this batch.
    return this.prisma.inventory.upsert({
      where: {
        productId_warehouseId_batchNumber: { 
          productId, 
          warehouseId, 
          batchNumber 
        },
      },
      update: {
        quantity: { increment: quantityToAdd },
      },
      create: {
        warehouseId,
        productId,
        quantity: quantityToAdd,
        batchNumber,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });
  }
// 4. ADMIN STOCK OVERRIDE (Fixing mistakes, manual stocktakes)
  async updateStockRecord(inventoryId: number, data: { quantity?: number; batchNumber?: string; expiryDate?: Date | null }) {
    return this.prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        ...(data.quantity !== undefined && { quantity: data.quantity }),
        ...(data.batchNumber && { batchNumber: data.batchNumber }),
        ...(data.expiryDate !== undefined && { expiryDate: data.expiryDate }),
      },
    });
  }

  async update(id: number, data: { quantity?: number; batchNumber?: string; expiryDate?: Date | null }) {
  return this.prisma.inventory.update({
    where: { id },
    data: {
      quantity: data.quantity,
      batchNumber: data.batchNumber,
      expiryDate: data.expiryDate,
    },
  });
}
  // 5. STOCK VALUE BY WAREHOUSE — qty × costPrice per batch, grouped/totaled by warehouse.
  // Falls back to sale price (flagged isEstimated) when costPrice hasn't been set yet.
  async getValuationByWarehouse() {
    const inventories = await this.prisma.inventory.findMany({
      where: { quantity: { gt: 0 } },
      include: { product: true, warehouse: true },
      orderBy: [{ warehouseId: 'asc' }, { product: { name: 'asc' } }],
    });

    const warehouseMap = new Map<number, { warehouseId: number; warehouseName: string; rows: any[]; total: number }>();

    for (const inv of inventories) {
      const hasCost = inv.product.costPrice > 0;
      const unitValue = hasCost ? inv.product.costPrice : inv.product.price;
      const value = unitValue * inv.quantity;

      if (!warehouseMap.has(inv.warehouseId)) {
        warehouseMap.set(inv.warehouseId, { warehouseId: inv.warehouseId, warehouseName: inv.warehouse.name, rows: [], total: 0 });
      }
      const bucket = warehouseMap.get(inv.warehouseId)!;
      bucket.rows.push({
        productId: inv.productId,
        productName: inv.product.name,
        batchNumber: inv.batchNumber,
        quantity: inv.quantity,
        unitValue,
        value,
        isEstimated: !hasCost,
      });
      bucket.total += value;
    }

    const warehouses = Array.from(warehouseMap.values());
    const grandTotal = warehouses.reduce((sum, w) => sum + w.total, 0);

    return { warehouses, grandTotal };
  }

  // 3. DEDUCT STOCK (Fulfilling an order)
  // 🔥 NEW: Requires batchNumber to know which specific items to deduct
  async deductStock(
    warehouseId: number, 
    productId: number, 
    quantityToDeduct: number,
    batchNumber: string = "DEFAULT"
  ) {
    if (quantityToDeduct <= 0) throw new BadRequestException('Must deduct a positive amount');

    // First, check if we actually have enough stock to fulfill this specific batch
    const currentStock = await this.prisma.inventory.findUnique({
      where: { 
        // 🔥 NEW: 3-part unique key
        productId_warehouseId_batchNumber: { 
          productId, 
          warehouseId, 
          batchNumber 
        } 
      },
    });

    if (!currentStock || currentStock.quantity < quantityToDeduct) {
      throw new BadRequestException(`Insufficient stock for Product #${productId} (Batch: ${batchNumber}) in Warehouse #${warehouseId}`);
    }

    // If we have enough, deduct it
    return this.prisma.inventory.update({
      where: {
        // 🔥 NEW: 3-part unique key
        productId_warehouseId_batchNumber: { 
          productId, 
          warehouseId, 
          batchNumber 
        },
      },
      data: {
        quantity: { decrement: quantityToDeduct },
      },
    });
  }
}
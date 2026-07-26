import { Injectable, BadRequestException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private journalService: JournalService,
  ) {}

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

  // Admin-facing "Adjust" on the Stock Report — a direct override of a batch's physical
  // quantity (stocktake corrections, fixing data-entry mistakes). Unlike transferStock(), there's
  // no separate source/destination, so a quantity change here is always self-contained: the
  // delta is logged to the audit trail and posted to the GL against the SAME batch's own
  // unitCost, using the same 1200 Inventory vs 5100 Inventory Adjustment treatment as a manual
  // stock adjustment/write-off.
  async update(id: number, data: { quantity?: number; batchNumber?: string; expiryDate?: Date | null; reason?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.inventory.findUnique({ where: { id } });
      if (!before) throw new BadRequestException(`Inventory record ${id} not found`);

      const updated = await tx.inventory.update({
        where: { id },
        data: {
          quantity: data.quantity,
          batchNumber: data.batchNumber,
          expiryDate: data.expiryDate,
        },
      });

      const delta = data.quantity !== undefined ? data.quantity - before.quantity : 0;
      if (delta !== 0) {
        await tx.stockMovement.create({
          data: {
            productId: before.productId,
            batchNumber: updated.batchNumber,
            fromWarehouseId: delta < 0 ? before.warehouseId : null,
            toWarehouseId: delta > 0 ? before.warehouseId : null,
            quantity: Math.abs(delta),
            type: 'ADJUSTMENT',
            reason: data.reason || `Manual stock count correction (Stock Report Adjust: ${before.quantity} → ${updated.quantity})`,
          },
        });

        const value = Math.abs(delta) * before.unitCost;
        if (value > 0) {
          const [inventoryAccountId, adjustmentAccountId] = await Promise.all([
            this.journalService.getMappedAccountId(tx, AccountMappingRole.INVENTORY),
            this.journalService.getMappedAccountId(tx, AccountMappingRole.INVENTORY_ADJUSTMENT),
          ]);
          await this.journalService.postEntry(tx, {
            sourceType: 'STOCK_ADJUSTMENT',
            sourceId: updated.id,
            memo: `Stock count correction — batch ${updated.batchNumber} (${before.quantity} → ${updated.quantity})${data.reason ? `: ${data.reason}` : ''}`,
            lines: delta > 0
              ? [
                  { accountId: inventoryAccountId, debit: value },
                  { accountId: adjustmentAccountId, credit: value },
                ]
              : [
                  { accountId: adjustmentAccountId, debit: value },
                  { accountId: inventoryAccountId, credit: value },
                ],
          });
        }
      }

      return updated;
    });
  }
  // 5. STOCK VALUE BY WAREHOUSE — qty × unit cost per batch, grouped/totaled by warehouse.
  // Prefers each batch's own landed cost (Inventory.unitCost, set at receipt time — reflects
  // what was actually paid, even across supplier price changes) over the single, editable
  // Product.costPrice, and falls back to sale price (flagged isEstimated) only when neither
  // cost figure is available yet.
  async getValuationByWarehouse() {
    const inventories = await this.prisma.inventory.findMany({
      where: { quantity: { gt: 0 } },
      include: { product: true, warehouse: true },
      orderBy: [{ warehouseId: 'asc' }, { product: { name: 'asc' } }],
    });

    const warehouseMap = new Map<number, { warehouseId: number; warehouseName: string; rows: any[]; total: number }>();

    for (const inv of inventories) {
      const hasBatchCost = inv.unitCost > 0;
      const hasProductCost = inv.product.costPrice > 0;
      const unitValue = hasBatchCost ? inv.unitCost : hasProductCost ? inv.product.costPrice : inv.product.price;
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
        isEstimated: !hasBatchCost && !hasProductCost,
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

    // Conditional update — the sufficiency check and decrement happen as one atomic statement
    // (not read-then-write), so two concurrent callers can't both pass a separate pre-check and
    // drive quantity negative.
    const deducted = await this.prisma.inventory.updateMany({
      where: { productId, warehouseId, batchNumber, quantity: { gte: quantityToDeduct } },
      data: { quantity: { decrement: quantityToDeduct } },
    });

    if (deducted.count === 0) {
      throw new BadRequestException(`Insufficient stock for Product #${productId} (Batch: ${batchNumber}) in Warehouse #${warehouseId}`);
    }

    return this.prisma.inventory.findUnique({
      where: { productId_warehouseId_batchNumber: { productId, warehouseId, batchNumber } },
    });
  }
}
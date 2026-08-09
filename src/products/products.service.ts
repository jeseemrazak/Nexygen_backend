import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private journalService: JournalService,
  ) {}

  async create(createProductDto: CreateProductDto) {
    return this.prisma.product.create({
      data: createProductDto,
    });
  }

  // 🔥 UPDATED: Now includes inventories so the frontend can calculate total aggregated stock
  async findAll(posActiveOnly?: boolean, activeOnly?: boolean) {
    const where: any = {};
    if (posActiveOnly) where.posActive = true;
    if (activeOnly) where.isActive = true;
    return this.prisma.product.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        inventories: true,
        category: true,
        posCategory: true,
        unit: true,
      },
      orderBy: { id: 'desc' } // Always show the newest products at the top of the list
    });
  }

  // 🔥 THE NEW SUPERCHARGED SEARCH ENGINE
  async searchProducts(query: string) {
    return this.prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { barcodePcs: { equals: query } }, // Exact match for fast scanner reads
          { barcodeBox: { equals: query } },
        ],
      },
      include: {
        inventories: {
          include: { warehouse: true }
        }
      },
      take: 10, // Limit to top 10 for fast frontend rendering
    });
  }

  // 🔥 ADVANCED IMPORT: Products + Inventory
  async importProducts(productsData: any[], warehouseId: number = 1) {
    let importedCount = 0;

    for (const row of productsData) {
      // 1. Extract Product Data
      const name = row['Product Name'] || 'Unknown Product';
      const sku = row['SKU'] ? String(row['SKU']) : `SKU-${Math.floor(Math.random() * 100000)}`;
      const barcodePcs = row['PCS Barcode'] ? String(row['PCS Barcode']) : null;
      const barcodeBox = row['Box Barcode'] ? String(row['Box Barcode']) : null;
      const description = row['Description'] || '';
      const price = parseFloat(row['Price']) || 0;

      // 2. Extract Inventory Data
      const quantity = parseInt(row['Quantity']) || 0;
      const batchNumber = row['Batch'] ? String(row['Batch']) : null;
      
      // Excel sometimes sends dates as numbers. This handles both strings and Excel numbers safely.
      const expiryRaw = row['Expiry'];
      let expiryDate = null;
      if (expiryRaw) {
        if (typeof expiryRaw === 'number') {
          expiryDate = new Date(Math.round((expiryRaw - 25569) * 86400 * 1000));
        } else {
          expiryDate = new Date(expiryRaw);
        }
      }

      // 3. Find existing product, or create a new one
      let product = await this.prisma.product.findFirst({
        where: { OR: [{ sku: sku }, { name: name }] }
      });

      if (!product) {
        product = await this.prisma.product.create({
          data: { name, sku, barcodePcs, barcodeBox, description, price }
        });
      } else {
        // Update barcodes if the product already exists but was missing them
        await this.prisma.product.update({
          where: { id: product.id },
          data: {
            barcodeBox: product.barcodeBox || barcodeBox,
            barcodePcs: product.barcodePcs || barcodePcs,
            price: price > 0 ? price : product.price, // Update price if provided
          }
        });
      }

      // 4. Add or Update Inventory (Only if a batch is provided)
      if (batchNumber && quantity > 0) {
        const existingInventory = await this.prisma.inventory.findUnique({
          where: {
            productId_warehouseId_batchNumber: {
              productId: product.id,
              warehouseId: warehouseId, // Defaults to warehouse 1
              batchNumber: batchNumber
            }
          }
        });

        if (existingInventory) {
          // If this batch already exists, add the new quantity to the existing stock
          await this.prisma.inventory.update({
            where: { id: existingInventory.id },
            data: {
              quantity: { increment: quantity },
              expiryDate: expiryDate || existingInventory.expiryDate
            }
          });
        } else {
          // Create new batch
          await this.prisma.inventory.create({
            data: {
              productId: product.id,
              warehouseId: warehouseId,
              batchNumber: batchNumber,
              quantity: quantity,
              expiryDate: expiryDate
            }
          });
        }
      }

      importedCount++;
    }

    return { message: `Successfully processed ${importedCount} rows into products and inventory!` };
  }
// 📜 GET STOCK MOVEMENT HISTORY (AUDIT TRAIL)
  async getStockMovements() {
    return this.prisma.stockMovement.findMany({
      orderBy: { createdAt: 'desc' }, // Newest first
      include: {
        product: { select: { name: true, sku: true } } // Bring in the product name
      },
      take: 200 // Limit to the most recent 200 records so the app stays fast
    });
  }
  // 🚚 STOCK TRANSFER & ADJUSTMENT ENGINE
  async transferStock(data: {
    productId: number;
    batchNumber: string;
    fromWarehouseId?: number; // Optional if adding new stock
    toWarehouseId?: number;   // Optional if writing off stock
    quantity: number;
    type: 'TRANSFER' | 'WRITE_OFF' | 'ADJUSTMENT';
    reason?: string;
    // ADJUSTMENT only — valuation for a brand-new batch with no source to inherit cost from.
    // Ignored when the batch already exists (its existing cost is kept) or when TRANSFER/
    // WRITE_OFF carry a source cost instead.
    unitCost?: number;
  }) {
    const { productId, batchNumber, fromWarehouseId, toWarehouseId, quantity, type, reason, unitCost } = data;

    if (quantity <= 0) throw new BadRequestException('Quantity must be greater than zero.');

    return this.prisma.$transaction(async (tx) => {

      // 1. DEDUCT FROM SOURCE WAREHOUSE (If applicable)
      // Captured up front — needed both to carry cost to the destination (TRANSFER) and to
      // value the GL entry for a WRITE_OFF, since the row is gone by the time we'd read it after.
      let sourceUnitCost: number | undefined;
      if (fromWarehouseId) {
        const sourceRow = await tx.inventory.findUnique({
          where: { productId_warehouseId_batchNumber: { productId, warehouseId: fromWarehouseId, batchNumber } },
        });
        sourceUnitCost = sourceRow?.unitCost;

        // Conditional update — the sufficiency check and decrement happen as one atomic
        // statement, so two concurrent transfers/write-offs against the same low-stock batch
        // can't both pass a separate pre-check and drive quantity negative.
        const deducted = await tx.inventory.updateMany({
          where: { productId, warehouseId: fromWarehouseId, batchNumber, quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (deducted.count === 0) {
          throw new BadRequestException(`Insufficient stock in source warehouse for batch ${batchNumber}.`);
        }
      }

      // 2. ADD TO DESTINATION WAREHOUSE (If applicable)
      let destinationUnitCost: number | undefined;
      if (toWarehouseId) {
        const destInventory = await tx.inventory.findUnique({
          where: { productId_warehouseId_batchNumber: { productId, warehouseId: toWarehouseId, batchNumber } }
        });

        // Carry over the source batch's expiry/cost if this is a transfer (not a fresh add).
        let sourceInfo: { expiryDate: Date | null; unitCost: number } | null = null;
        if (fromWarehouseId) {
          sourceInfo = await tx.inventory.findUnique({
            where: { productId_warehouseId_batchNumber: { productId, warehouseId: fromWarehouseId, batchNumber } },
          });
        }

        if (destInventory) {
          // Add to existing batch — weighted-average the cost if an incoming cost is known
          // (a TRANSFER's source batch, or a caller-supplied cost on an ADJUSTMENT), same
          // reasoning as receipts merging into an existing batch at a different cost.
          const incomingUnitCost = sourceInfo?.unitCost ?? unitCost;
          const blendedUnitCost = incomingUnitCost !== undefined
            ? (destInventory.quantity * destInventory.unitCost + quantity * incomingUnitCost) / (destInventory.quantity + quantity)
            : destInventory.unitCost;
          await tx.inventory.update({
            where: { id: destInventory.id },
            data: { quantity: { increment: quantity }, unitCost: blendedUnitCost }
          });
          destinationUnitCost = blendedUnitCost;
        } else {
          // Create new batch in destination warehouse — prefer a source batch's cost
          // (TRANSFER), then a caller-supplied cost (ADJUSTMENT), then 0 (untracked).
          destinationUnitCost = sourceInfo?.unitCost ?? unitCost ?? 0;
          await tx.inventory.create({
            data: {
              productId, warehouseId: toWarehouseId, batchNumber, quantity,
              expiryDate: sourceInfo?.expiryDate ?? null,
              unitCost: destinationUnitCost,
            }
          });
        }
      }

      // 3. LOG THE MOVEMENT FOR THE AUDIT TRAIL
      const movementLog = await tx.stockMovement.create({
        data: {
          productId, batchNumber, fromWarehouseId, toWarehouseId, quantity, type, reason
        }
      });

      // 4. POST TO THE GENERAL LEDGER
      // TRANSFER moves the same value between warehouses (cost is carried, not re-valued) —
      // total inventory value is unchanged, so it has no GL impact. WRITE_OFF and ADJUSTMENT
      // both post against 5100 "Inventory Adjustment" vs 1200 "Inventory", mirroring the
      // COGS/receipt posting pattern elsewhere in this codebase. Skipped when the batch's cost
      // is untracked (0) — same "skip zero-value entries" convention used for COGS/receipts.
      if (type === 'WRITE_OFF') {
        const value = (sourceUnitCost ?? 0) * quantity;
        if (value > 0) {
          const [adjustmentAccountId, inventoryAccountId] = await Promise.all([
            this.journalService.getMappedAccountId(tx, AccountMappingRole.INVENTORY_ADJUSTMENT),
            this.journalService.getMappedAccountId(tx, AccountMappingRole.INVENTORY),
          ]);
          await this.journalService.postEntry(tx, {
            sourceType: 'STOCK_ADJUSTMENT',
            sourceId: movementLog.id,
            memo: `Stock write-off — batch ${batchNumber}${reason ? ` (${reason})` : ''}`,
            lines: [
              { accountId: adjustmentAccountId, debit: value },
              { accountId: inventoryAccountId, credit: value },
            ],
          });
        }
      } else if (type === 'ADJUSTMENT') {
        const value = (destinationUnitCost ?? 0) * quantity;
        if (value > 0) {
          const [inventoryAccountId, adjustmentAccountId] = await Promise.all([
            this.journalService.getMappedAccountId(tx, AccountMappingRole.INVENTORY),
            this.journalService.getMappedAccountId(tx, AccountMappingRole.INVENTORY_ADJUSTMENT),
          ]);
          await this.journalService.postEntry(tx, {
            sourceType: 'STOCK_ADJUSTMENT',
            sourceId: movementLog.id,
            memo: `Stock adjustment — batch ${batchNumber}${reason ? ` (${reason})` : ''}`,
            lines: [
              { accountId: inventoryAccountId, debit: value },
              { accountId: adjustmentAccountId, credit: value },
            ],
          });
        }
      }

      return movementLog;
    }, { timeout: 15000 });
  }

  async findOne(id: any) { // Use 'any' or 'string' to handle the incoming param
    // 🔥 FORCE THE ID TO BE A NUMBER
    const numericId = parseInt(id, 10);
    
    if (isNaN(numericId)) {
      throw new BadRequestException('Invalid product ID');
    }

    return this.prisma.product.findUnique({
      where: { id: numericId },
      include: {
        inventories: {
          include: { warehouse: true }
        },
        category: true,
        posCategory: true,
        unit: true,
      }
    });
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    return this.prisma.product.update({
      where: { id },
      data: updateProductDto,
    });
  }

  async remove(id: number) {
    return this.prisma.product.delete({
      where: { id },
    });
  }
}
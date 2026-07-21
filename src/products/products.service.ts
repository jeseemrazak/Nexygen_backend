import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    return this.prisma.product.create({
      data: createProductDto,
    });
  }

  // 🔥 UPDATED: Now includes inventories so the frontend can calculate total aggregated stock
  async findAll() {
    return this.prisma.product.findMany({
      include: {
        inventories: true, 
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
  }) {
    const { productId, batchNumber, fromWarehouseId, toWarehouseId, quantity, type, reason } = data;

    if (quantity <= 0) throw new BadRequestException('Quantity must be greater than zero.');

    return this.prisma.$transaction(async (tx) => {
      
      // 1. DEDUCT FROM SOURCE WAREHOUSE (If applicable)
      if (fromWarehouseId) {
        const sourceInventory = await tx.inventory.findUnique({
          where: { productId_warehouseId_batchNumber: { productId, warehouseId: fromWarehouseId, batchNumber } }
        });

        if (!sourceInventory || sourceInventory.quantity < quantity) {
          throw new BadRequestException(`Insufficient stock in source warehouse for batch ${batchNumber}.`);
        }

        await tx.inventory.update({
          where: { id: sourceInventory.id },
          data: { quantity: { decrement: quantity } }
        });
      }

      // 2. ADD TO DESTINATION WAREHOUSE (If applicable)
      if (toWarehouseId) {
        const destInventory = await tx.inventory.findUnique({
          where: { productId_warehouseId_batchNumber: { productId, warehouseId: toWarehouseId, batchNumber } }
        });

        if (destInventory) {
          // Add to existing batch
          await tx.inventory.update({
            where: { id: destInventory.id },
            data: { quantity: { increment: quantity } }
          });
        } else {
          // Create new batch in destination warehouse
          // Note: We carry over the expiry date from the source if it's a transfer
          let expiryDate = null;
          if (fromWarehouseId) {
             const sourceInfo = await tx.inventory.findUnique({
                where: { productId_warehouseId_batchNumber: { productId, warehouseId: fromWarehouseId, batchNumber } }
             });
             expiryDate = sourceInfo?.expiryDate;
          }

          await tx.inventory.create({
            data: {
              productId, warehouseId: toWarehouseId, batchNumber, quantity, expiryDate
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

      return movementLog;
    });
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
        } 
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
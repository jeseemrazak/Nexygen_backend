import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';

const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  purchaseOrder: { include: { warehouse: true, supplier: true } },
};

@Injectable()
export class ReceiptsService {
  constructor(
    private prisma: PrismaService,
    private journalService: JournalService,
  ) {}

  // Creates one goods-receipt event covering some (or all) of a Purchase Order's remaining
  // unreceived quantity — batch/expiry is captured here, stock is added here. A Purchase Order
  // can have several of these (partial deliveries from the supplier) before it's fully RECEIVED.
  async create(dto: CreateReceiptDto) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.purchaseOrderId },
      include: { items: true, supplier: true },
    });
    if (!po) throw new NotFoundException(`Purchase Order ${dto.purchaseOrderId} not found`);
    if (po.status !== 'ORDERED') {
      throw new BadRequestException(`Purchase Order ${dto.purchaseOrderId} must be ORDERED before a receipt can be created (status: ${po.status})`);
    }

    for (const reqItem of dto.items) {
      const poItem = po.items.find((i) => i.id === reqItem.purchaseOrderItemId);
      if (!poItem) {
        throw new BadRequestException(`Item ${reqItem.purchaseOrderItemId} is not part of Purchase Order #${dto.purchaseOrderId}`);
      }
      const remaining = poItem.quantityOrdered - poItem.quantityReceived;
      if (reqItem.quantity > remaining) {
        throw new BadRequestException(`Cannot receive ${reqItem.quantity} for item ${reqItem.purchaseOrderItemId}; only ${remaining} remaining`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({ data: { purchaseOrderId: dto.purchaseOrderId } });
      await tx.receipt.update({
        where: { id: receipt.id },
        data: { receiptNumber: `RCPT-${String(receipt.id).padStart(6, '0')}` },
      });

      let receiptValue = 0;

      for (const reqItem of dto.items) {
        const poItem = po.items.find((i) => i.id === reqItem.purchaseOrderItemId)!;
        const expiryDate = reqItem.expiryDate ? new Date(reqItem.expiryDate) : null;

        await tx.receiptItem.create({
          data: {
            receiptId: receipt.id,
            purchaseOrderItemId: poItem.id,
            productId: poItem.productId,
            quantity: reqItem.quantity,
            batchNumber: reqItem.batchNumber,
            expiryDate,
          },
        });

        // Weighted-average the landed cost when receiving more into a batch that already has
        // stock at a different cost (normal in wholesale — supplier prices change between
        // receipts) — a plain increment would silently keep the older cost and misstate value.
        const existingInv = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_batchNumber: {
              productId: poItem.productId,
              warehouseId: po.warehouseId,
              batchNumber: reqItem.batchNumber,
            },
          },
        });
        const blendedUnitCost = existingInv
          ? (existingInv.quantity * existingInv.unitCost + reqItem.quantity * poItem.unitCost) / (existingInv.quantity + reqItem.quantity)
          : poItem.unitCost;

        await tx.inventory.upsert({
          where: {
            productId_warehouseId_batchNumber: {
              productId: poItem.productId,
              warehouseId: po.warehouseId,
              batchNumber: reqItem.batchNumber,
            },
          },
          update: { quantity: { increment: reqItem.quantity }, unitCost: blendedUnitCost },
          create: {
            productId: poItem.productId,
            warehouseId: po.warehouseId,
            batchNumber: reqItem.batchNumber,
            quantity: reqItem.quantity,
            unitCost: poItem.unitCost,
            expiryDate,
          },
        });

        // Guard is the WHERE clause (current DB value vs. a precomputed threshold), not the
        // pre-transaction `remaining` check above — two concurrent receipts against the same PO
        // item can't both pass that check and jointly over-receive past quantityOrdered.
        const claimed = await tx.purchaseOrderItem.updateMany({
          where: { id: poItem.id, quantityReceived: { lte: poItem.quantityOrdered - reqItem.quantity } },
          data: { quantityReceived: { increment: reqItem.quantity } },
        });
        if (claimed.count === 0) {
          throw new BadRequestException(`Cannot receive ${reqItem.quantity} for item ${poItem.id}; exceeds ordered quantity`);
        }

        await tx.stockMovement.create({
          data: {
            productId: poItem.productId,
            batchNumber: reqItem.batchNumber,
            toWarehouseId: po.warehouseId,
            quantity: reqItem.quantity,
            type: 'PURCHASE_RECEIPT',
            reason: `Received against PO #${po.id}`,
          },
        });

        receiptValue += reqItem.quantity * poItem.unitCost;
      }

      // 💰 Auto-post: Dr Inventory / Cr Stock Interim (Received) — the asset increases the
      // moment goods physically arrive, before the supplier's actual bill is recorded.
      if (receiptValue > 0) {
        const [inventoryAccountId, stockInterimAccountId] = await Promise.all([
          this.journalService.getMappedAccountId(tx, AccountMappingRole.INVENTORY),
          this.journalService.getMappedAccountId(tx, AccountMappingRole.STOCK_INTERIM),
        ]);
        await this.journalService.postEntry(tx, {
          sourceType: 'PURCHASE_RECEIPT',
          sourceId: receipt.id,
          memo: `Goods receipt for PO #${po.id}`,
          lines: [
            { accountId: inventoryAccountId, debit: receiptValue },
            { accountId: stockInterimAccountId, credit: receiptValue, partyType: 'SUPPLIER', partyName: po.supplier.name },
          ],
        });
      }

      const updatedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: dto.purchaseOrderId } });
      const fullyReceived = updatedItems.every((i) => i.quantityReceived >= i.quantityOrdered);
      if (fullyReceived) {
        await tx.purchaseOrder.update({ where: { id: dto.purchaseOrderId }, data: { status: 'RECEIVED' } });
      }

      return tx.receipt.findUnique({ where: { id: receipt.id }, include: DETAIL_INCLUDE });
    }, { timeout: 15000 });
  }

  async findAll(purchaseOrderId?: number) {
    return this.prisma.receipt.findMany({
      where: purchaseOrderId ? { purchaseOrderId } : undefined,
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const receipt = await this.prisma.receipt.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!receipt) throw new NotFoundException(`Receipt ${id} not found`);
    return receipt;
  }
}

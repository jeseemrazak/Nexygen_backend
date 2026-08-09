import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ReturnDeliveryDto } from './dto/return-delivery.dto';
import { AccountMappingRole, DeliveryStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  salesOrder: { include: { warehouse: true, user: { select: { name: true, email: true } } } },
  returns: { include: { items: true }, orderBy: { createdAt: 'desc' as const } },
};

@Injectable()
export class DeliveriesService {
  constructor(
    private prisma: PrismaService,
    private journalService: JournalService,
    private notifications: NotificationsService,
  ) {}

  // Creates one delivery event covering some (or all) of a Sales Order's remaining
  // undelivered quantity — batch is chosen here, stock is deducted here. A Sales Order can
  // have several of these (partial shipments) before it's fully DONE.
  async create(dto: CreateDeliveryDto) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: dto.salesOrderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException(`Sales Order ${dto.salesOrderId} not found`);
    if (order.status !== 'CONFIRMED' && order.status !== 'DONE') {
      throw new BadRequestException(`Sales Order ${dto.salesOrderId} must be CONFIRMED before a delivery can be created (status: ${order.status})`);
    }

    for (const reqItem of dto.items) {
      const soItem = order.items.find((i) => i.id === reqItem.salesOrderItemId);
      if (!soItem) {
        throw new BadRequestException(`Item ${reqItem.salesOrderItemId} is not part of Sales Order #${dto.salesOrderId}`);
      }
      const remaining = soItem.quantity - soItem.quantityDelivered;
      if (reqItem.quantity > remaining) {
        throw new BadRequestException(`Cannot deliver ${reqItem.quantity} for item ${reqItem.salesOrderItemId}; only ${remaining} remaining`);
      }
    }

    const stockDecrements: { productId: number; name: string; quantity: number }[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.create({ data: { salesOrderId: dto.salesOrderId, status: 'PENDING' } });

      let totalCost = 0;
      for (const reqItem of dto.items) {
        const soItem = order.items.find((i) => i.id === reqItem.salesOrderItemId)!;
        const productData = await tx.product.findUnique({ where: { id: soItem.productId } });
        const isService = productData?.type === 'SERVICE';
        // Services have no warehouse/batch stock to pick from — everything below the item-create
        // (batch resolution, cost-by-batch lookup, the atomic stock decrement) is Goods-only.
        const batchNumber = isService ? 'SERVICE' : reqItem.batchNumber;
        if (!isService && !batchNumber) {
          throw new BadRequestException(`Batch number is required for Product #${soItem.productId}`);
        }

        await tx.deliveryItem.create({
          data: {
            deliveryId: delivery.id,
            salesOrderItemId: soItem.id,
            productId: soItem.productId,
            quantity: reqItem.quantity,
            batchNumber,
            boxBarcode: productData?.barcodeBox || null,
          },
        });

        let unitCost = productData?.costPrice ?? 0;
        if (!isService) {
          // Cost lookup only — the actual sufficiency guard is the conditional updateMany below.
          // Prefers the batch's own landed cost over Product.costPrice, same reasoning as POS/valuation.
          const inv = await tx.inventory.findUnique({
            where: {
              productId_warehouseId_batchNumber: {
                productId: soItem.productId,
                warehouseId: order.warehouseId,
                batchNumber: batchNumber!,
              },
            },
          });
          unitCost = inv && inv.unitCost > 0 ? inv.unitCost : (productData?.costPrice ?? 0);

          // Conditional update — the stock-sufficiency check and the decrement happen as one
          // atomic statement (not read-then-write), so two concurrent deliveries against the same
          // low-stock batch can't both pass a separate pre-check and drive quantity negative.
          const deducted = await tx.inventory.updateMany({
            where: {
              productId: soItem.productId,
              warehouseId: order.warehouseId,
              batchNumber: batchNumber!,
              quantity: { gte: reqItem.quantity },
            },
            data: { quantity: { decrement: reqItem.quantity } },
          });
          if (deducted.count === 0) {
            throw new BadRequestException(`Insufficient stock for Product #${soItem.productId} (Batch: ${batchNumber}).`);
          }
          stockDecrements.push({ productId: soItem.productId, name: productData?.name ?? `#${soItem.productId}`, quantity: reqItem.quantity });
        }
        totalCost += reqItem.quantity * unitCost;

        // Guard is the WHERE clause (current DB value vs. a precomputed threshold), not the
        // pre-transaction `remaining` check above — two concurrent deliveries against the same
        // order item can't both pass that check and jointly over-deliver past the ordered quantity.
        const claimed = await tx.salesOrderItem.updateMany({
          where: { id: soItem.id, quantityDelivered: { lte: soItem.quantity - reqItem.quantity } },
          data: { quantityDelivered: { increment: reqItem.quantity } },
        });
        if (claimed.count === 0) {
          throw new BadRequestException(`Cannot deliver ${reqItem.quantity} for item ${soItem.id}; exceeds ordered quantity`);
        }
      }

      // Physical stock leaves the building at delivery time (not at invoicing, which is a
      // separate billing event that may lag or split across several deliveries) — so COGS is
      // recognized here, mirroring exactly how POS recognizes COGS at the moment of sale.
      // Skipped when cost isn't tracked yet (0-cost line), same convention as POS/Bills.
      if (totalCost > 0) {
        const [cogsAccountId, inventoryAccountId] = await Promise.all([
          this.journalService.getMappedAccountId(tx, AccountMappingRole.COGS),
          this.journalService.getMappedAccountId(tx, AccountMappingRole.INVENTORY),
        ]);
        await this.journalService.postEntry(tx, {
          sourceType: 'SALES_DELIVERY_COGS',
          sourceId: delivery.id,
          memo: `COGS for Delivery #${delivery.id} (Sales Order #${dto.salesOrderId})`,
          lines: [
            { accountId: cogsAccountId, debit: totalCost, warehouseId: order.warehouseId },
            { accountId: inventoryAccountId, credit: totalCost, warehouseId: order.warehouseId },
          ],
        });
      }

      const updatedItems = await tx.salesOrderItem.findMany({ where: { salesOrderId: dto.salesOrderId } });
      const fullyDelivered = updatedItems.every((i) => i.quantityDelivered >= i.quantity);
      if (fullyDelivered) {
        await tx.salesOrder.update({ where: { id: dto.salesOrderId }, data: { status: 'DONE' } });
      }

      return tx.delivery.findUnique({ where: { id: delivery.id }, include: DETAIL_INCLUDE });
    }, { timeout: 15000 });

    this.checkLowStockAfterDecrements(stockDecrements).catch(() => {});
    return result;
  }

  // Runs after the transaction commits — low-stock notification is best-effort and must never
  // affect the delivery itself. "Before" is reconstructed from "after + this decrement's quantity"
  // rather than read inside the transaction, since it's only used for a crossing check, not a
  // financial or stock calculation.
  private async checkLowStockAfterDecrements(decrements: { productId: number; name: string; quantity: number }[]) {
    for (const dec of decrements) {
      const totals = await this.prisma.inventory.aggregate({
        where: { productId: dec.productId },
        _sum: { quantity: true },
      });
      const after = totals._sum.quantity ?? 0;
      await this.notifications.notifyLowStockIfCrossed({ id: dec.productId, name: dec.name }, after + dec.quantity, after);
    }
  }

  // Restocks whatever quantity is returned and posts a fresh Dr Inventory / Cr COGS entry sized
  // to just the returned portion — the original delivery's COGS entry covers the WHOLE delivery
  // and can't be partially voided, and returns are frequently partial, so a new reversing entry
  // is posted instead of voiding anything. "Already returned" is always summed live from
  // DeliveryReturnItem (never a mutable counter), same ledger-only convention used elsewhere.
  async returnItems(deliveryId: number, dto: ReturnDeliveryDto) {
    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: { items: true, salesOrder: true },
      });
      if (!delivery) throw new NotFoundException(`Delivery ${deliveryId} not found`);

      let totalCost = 0;
      const deliveryReturn = await tx.deliveryReturn.create({
        data: { deliveryId, reason: dto.reason },
      });

      for (const reqItem of dto.items) {
        const deliveryItem = delivery.items.find((i) => i.id === reqItem.deliveryItemId);
        if (!deliveryItem) {
          throw new BadRequestException(`Item ${reqItem.deliveryItemId} is not part of Delivery #${deliveryId}`);
        }

        const { _sum } = await tx.deliveryReturnItem.aggregate({
          where: { deliveryItemId: deliveryItem.id },
          _sum: { quantity: true },
        });
        const alreadyReturned = _sum.quantity || 0;
        const remaining = deliveryItem.quantity - alreadyReturned;
        if (reqItem.quantity > remaining) {
          throw new BadRequestException(`Cannot return ${reqItem.quantity} for item ${deliveryItem.id}; only ${remaining} remaining`);
        }

        await tx.deliveryReturnItem.create({
          data: { deliveryReturnId: deliveryReturn.id, deliveryItemId: deliveryItem.id, quantity: reqItem.quantity },
        });

        const productData = await tx.product.findUnique({ where: { id: deliveryItem.productId } });
        const isService = deliveryItem.batchNumber === 'SERVICE' || productData?.type === 'SERVICE';
        let unitCost = productData?.costPrice ?? 0;

        if (!isService) {
          const inv = await tx.inventory.findUnique({
            where: {
              productId_warehouseId_batchNumber: {
                productId: deliveryItem.productId,
                warehouseId: delivery.salesOrder.warehouseId,
                batchNumber: deliveryItem.batchNumber,
              },
            },
          });
          unitCost = inv && inv.unitCost > 0 ? inv.unitCost : (productData?.costPrice ?? 0);

          await tx.inventory.upsert({
            where: {
              productId_warehouseId_batchNumber: {
                productId: deliveryItem.productId,
                warehouseId: delivery.salesOrder.warehouseId,
                batchNumber: deliveryItem.batchNumber,
              },
            },
            update: { quantity: { increment: reqItem.quantity } },
            create: {
              productId: deliveryItem.productId,
              warehouseId: delivery.salesOrder.warehouseId,
              batchNumber: deliveryItem.batchNumber,
              quantity: reqItem.quantity,
              unitCost,
            },
          });
        }
        totalCost += reqItem.quantity * unitCost;

        await tx.salesOrderItem.update({
          where: { id: deliveryItem.salesOrderItemId },
          data: { quantityDelivered: { decrement: reqItem.quantity } },
        });
      }

      if (delivery.salesOrder.status === 'DONE') {
        await tx.salesOrder.update({ where: { id: delivery.salesOrderId }, data: { status: 'CONFIRMED' } });
      }

      if (totalCost > 0) {
        const [cogsAccountId, inventoryAccountId] = await Promise.all([
          this.journalService.getMappedAccountId(tx, AccountMappingRole.COGS),
          this.journalService.getMappedAccountId(tx, AccountMappingRole.INVENTORY),
        ]);
        await this.journalService.postEntry(tx, {
          sourceType: 'SALES_DELIVERY_RETURN',
          sourceId: deliveryReturn.id,
          memo: `Return against Delivery #${deliveryId}${dto.reason ? ` (${dto.reason})` : ''}`,
          lines: [
            { accountId: inventoryAccountId, debit: totalCost, warehouseId: delivery.salesOrder.warehouseId },
            { accountId: cogsAccountId, credit: totalCost, warehouseId: delivery.salesOrder.warehouseId },
          ],
        });
      }

      return tx.delivery.findUnique({ where: { id: deliveryId }, include: DETAIL_INCLUDE });
    }, { timeout: 15000 });
  }

  async findAll(salesOrderId?: number) {
    return this.prisma.delivery.findMany({
      where: salesOrderId ? { salesOrderId } : undefined,
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Expiry isn't stored on the DeliveryItem snapshot — it's looked up live from Inventory by
  // batch, same pattern the old Order detail endpoint used (expiry can change/get corrected
  // on the batch after the delivery already happened).
  async findOne(id: number) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!delivery) throw new NotFoundException(`Delivery ${id} not found`);

    const warehouseId = delivery.salesOrder.warehouseId;
    const itemsWithExpiry = await Promise.all(
      delivery.items.map(async (item) => {
        const inventoryRecord = await this.prisma.inventory.findUnique({
          where: {
            productId_warehouseId_batchNumber: {
              productId: item.productId,
              warehouseId,
              batchNumber: item.batchNumber,
            },
          },
        });
        return { ...item, expiryDate: inventoryRecord?.expiryDate || null };
      }),
    );

    return { ...delivery, items: itemsWithExpiry };
  }

  // Ship / mark-delivered transitions. `proofPath` is set when a signature/photo was uploaded
  // (the merchandiser mobile app always sends one when marking DELIVERED).
  async updateStatus(id: number, status: DeliveryStatus, proofPath?: string | null) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException(`Delivery ${id} not found`);

    const data: any = { status };
    if (proofPath) data.proofOfDelivery = proofPath;

    const updated = await this.prisma.delivery.update({ where: { id }, data, include: DETAIL_INCLUDE });
    if (status === 'DELIVERED') {
      this.notifications.notifyDelivered(updated).catch(() => {});
    }
    return updated;
  }

  // Every active (not yet DELIVERED/CANCELLED) delivery assigned to one merchandiser —
  // backs the mobile app's "My Daily Route" screen via the /orders compat shim.
  async findActiveForMerchandiser(merchandiserId: number) {
    return this.prisma.delivery.findMany({
      where: {
        status: { in: ['PENDING', 'SHIPPED'] },
        salesOrder: { userId: merchandiserId },
      },
      include: {
        items: { include: { product: true } },
        salesOrder: { select: { clientName: true } },
      },
    });
  }
}

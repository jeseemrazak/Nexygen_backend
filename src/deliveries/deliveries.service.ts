import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { DeliveryStatus } from '@prisma/client';

const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  salesOrder: { include: { warehouse: true, user: { select: { name: true, email: true } } } },
};

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService) {}

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

    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.create({ data: { salesOrderId: dto.salesOrderId, status: 'PENDING' } });

      for (const reqItem of dto.items) {
        const soItem = order.items.find((i) => i.id === reqItem.salesOrderItemId)!;
        const productData = await tx.product.findUnique({ where: { id: soItem.productId } });

        await tx.deliveryItem.create({
          data: {
            deliveryId: delivery.id,
            salesOrderItemId: soItem.id,
            productId: soItem.productId,
            quantity: reqItem.quantity,
            batchNumber: reqItem.batchNumber,
            boxBarcode: productData?.barcodeBox || null,
          },
        });

        const currentStock = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_batchNumber: {
              productId: soItem.productId,
              warehouseId: order.warehouseId,
              batchNumber: reqItem.batchNumber,
            },
          },
        });
        if (!currentStock || currentStock.quantity < reqItem.quantity) {
          throw new BadRequestException(`Insufficient stock for Product #${soItem.productId} (Batch: ${reqItem.batchNumber}).`);
        }
        await tx.inventory.update({
          where: {
            productId_warehouseId_batchNumber: {
              productId: soItem.productId,
              warehouseId: order.warehouseId,
              batchNumber: reqItem.batchNumber,
            },
          },
          data: { quantity: { decrement: reqItem.quantity } },
        });

        await tx.salesOrderItem.update({
          where: { id: soItem.id },
          data: { quantityDelivered: { increment: reqItem.quantity } },
        });
      }

      const updatedItems = await tx.salesOrderItem.findMany({ where: { salesOrderId: dto.salesOrderId } });
      const fullyDelivered = updatedItems.every((i) => i.quantityDelivered >= i.quantity);
      if (fullyDelivered) {
        await tx.salesOrder.update({ where: { id: dto.salesOrderId }, data: { status: 'DONE' } });
      }

      return tx.delivery.findUnique({ where: { id: delivery.id }, include: DETAIL_INCLUDE });
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

    return this.prisma.delivery.update({ where: { id }, data, include: DETAIL_INCLUDE });
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

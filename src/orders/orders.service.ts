import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryStatus } from '@prisma/client';
import { resolveDateRange } from '../common/date-range.util';

// Backward-compatibility shim: the live mobile app (distribution_mobile) and the dashboard
// home page only ever call the 4 endpoints below, and both expect the exact response shapes
// this module produced back when "Order" did everything. The real Sales flow now lives in
// sales-orders/deliveries/invoices — this module just re-derives the old shapes from Delivery.
@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  // 📱 Flutter app: flat list of this merchandiser's active deliveries.
  async getOrdersByMerchandiser(merchandiserId: number) {
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        status: { in: ['PENDING', 'SHIPPED'] },
        salesOrder: { userId: merchandiserId },
      },
      include: {
        items: { include: { product: true } },
        salesOrder: { select: { clientName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return deliveries.map((d) => ({
      id: d.id,
      clientName: d.salesOrder.clientName,
      status: d.status,
      items: d.items.map((i) => ({
        product: { name: i.product.name },
        quantity: i.quantity,
        batchNumber: i.batchNumber,
      })),
    }));
  }

  // 📱 Flutter app: proof-of-delivery capture. `id` here is the Delivery id (the same id
  // getOrdersByMerchandiser handed back as "id"), not a Sales Order id.
  async updateOrderStatus(id: number, status: DeliveryStatus, proofPath?: string | null) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException(`Delivery ${id} not found`);

    const data: any = { status };
    if (proofPath) data.proofOfDelivery = proofPath;

    return this.prisma.delivery.update({ where: { id }, data });
  }

  async getMerchandisers() {
    return this.prisma.user.findMany({
      where: { role: 'MERCHANDISER' },
      select: { id: true, name: true, email: true },
    });
  }

  // 💻 Dashboard home page KPIs. "Orders" in this view means Deliveries — each one already
  // carries its own status/proofOfDelivery/timestamps, same shape the page has always rendered.
  async getDashboardSummary(query?: any) {
    const { merchandiserId, status } = query || {};

    const dateFilter = resolveDateRange(query);
    const baseWhere = dateFilter ? { createdAt: dateFilter } : {};

    const totalOrders = await this.prisma.delivery.count({ where: baseWhere });
    const pendingOrders = await this.prisma.delivery.count({ where: { ...baseWhere, status: 'PENDING' } });
    const deliveredOrders = await this.prisma.delivery.count({ where: { ...baseWhere, status: 'DELIVERED' } });

    const merchandisersList = await this.prisma.user.findMany({
      where: { role: 'MERCHANDISER' },
      select: { id: true, name: true },
    });

    const allProducts = await this.prisma.product.findMany({
      include: { inventories: { select: { quantity: true } } },
    });

    const lowStockItems = allProducts
      .map((product) => ({
        id: product.id,
        name: product.name,
        totalQuantity: product.inventories.reduce((sum, batch) => sum + batch.quantity, 0),
      }))
      .filter((product) => product.totalQuantity < 20)
      .sort((a, b) => a.totalQuantity - b.totalQuantity)
      .slice(0, 10);

    const deliveriesWhere: any = { ...baseWhere };
    if (merchandiserId && merchandiserId !== 'ALL') deliveriesWhere.salesOrder = { userId: Number(merchandiserId) };
    if (status && status !== 'ALL') deliveriesWhere.status = status;

    const recentDeliveries = await this.prisma.delivery.findMany({
      where: deliveriesWhere,
      orderBy: { id: 'desc' },
      take: 50,
      include: {
        items: { include: { product: true } },
        salesOrder: { select: { clientName: true, userId: true, user: { select: { name: true, email: true } } } },
      },
    });

    const recentOrders = recentDeliveries.map((d) => ({
      id: d.id,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      status: d.status,
      proofOfDelivery: d.proofOfDelivery,
      clientName: d.salesOrder.clientName,
      userId: d.salesOrder.userId,
      user: d.salesOrder.user,
      items: d.items,
    }));

    return {
      kpis: {
        totalOrders,
        pendingOrders,
        deliveredOrders,
        activeMerchandisers: merchandisersList.length,
      },
      merchandisersList,
      lowStockItems,
      recentOrders,
    };
  }
}

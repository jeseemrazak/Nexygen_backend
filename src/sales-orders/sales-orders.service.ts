import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ConfirmSalesOrderDto } from './dto/confirm-sales-order.dto';

const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  warehouse: true,
  user: { select: { id: true, name: true, email: true } },
  deliveries: { include: { items: { include: { product: true } } }, orderBy: { createdAt: 'desc' as const } },
  invoices: { orderBy: { createdAt: 'desc' as const } },
};

@Injectable()
export class SalesOrdersService {
  constructor(private prisma: PrismaService) {}

  // Every Sales Order starts life as a DRAFT — merchandiser assignment always happens via
  // confirm(), whether this order came from a converted Quotation or was created directly.
  // No stock, no batch, no invoice here — those belong to Delivery/Invoice respectively.
  async create(dto: CreateSalesOrderDto) {
    const totalAmount = dto.items.reduce((sum, i) => sum + i.quantity * i.price, 0);
    return this.prisma.salesOrder.create({
      data: {
        warehouseId: dto.warehouseId,
        clientName: dto.clientName,
        totalAmount,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: i.price,
          })),
        },
      },
      include: DETAIL_INCLUDE,
    });
  }

  // Used internally by QuotationsService.convert() — same shape, just named for that call site.
  async createFromQuotation(dto: { warehouseId: number; clientName?: string; items: { productId: number; quantity: number; price: number }[]; totalAmount: number }) {
    return this.prisma.salesOrder.create({
      data: {
        warehouseId: dto.warehouseId,
        clientName: dto.clientName,
        totalAmount: dto.totalAmount,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: i.price,
          })),
        },
      },
      include: DETAIL_INCLUDE,
    });
  }

  async findAll(status?: string) {
    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    return this.prisma.salesOrder.findMany({
      where,
      include: {
        items: true,
        warehouse: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const order = await this.prisma.salesOrder.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!order) throw new NotFoundException(`Sales Order ${id} not found`);
    return order;
  }

  // DRAFT -> CONFIRMED: this is where the merchandiser gets assigned. Deliveries and Invoices
  // can only be created against a CONFIRMED (or DONE, for further partial invoicing) order.
  async confirm(id: number, dto: ConfirmSalesOrderDto) {
    const order = await this.prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Sales Order ${id} not found`);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException(`Sales Order ${id} is not a draft (status: ${order.status})`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user || user.role !== 'MERCHANDISER') {
      throw new BadRequestException('Invalid user or not a merchandiser');
    }

    return this.prisma.salesOrder.update({
      where: { id },
      data: { userId: dto.userId, status: 'CONFIRMED' },
      include: DETAIL_INCLUDE,
    });
  }

  // Only safe while nothing has been fulfilled/billed yet.
  async cancel(id: number) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: { deliveries: true, invoices: true },
    });
    if (!order) throw new NotFoundException(`Sales Order ${id} not found`);
    if (order.status === 'CANCELLED') throw new BadRequestException(`Sales Order ${id} is already cancelled`);
    if (order.deliveries.length > 0 || order.invoices.length > 0) {
      throw new BadRequestException(`Cannot cancel Sales Order ${id} — it already has deliveries or invoices against it`);
    }
    return this.prisma.salesOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  // Only a never-confirmed DRAFT (nothing committed anywhere) can be hard-deleted.
  async remove(id: number) {
    const order = await this.prisma.salesOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Sales Order ${id} not found`);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException(`Only a DRAFT Sales Order can be deleted — cancel it instead`);
    }
    return this.prisma.salesOrder.delete({ where: { id } });
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { ConfirmSalesOrderDto } from './dto/confirm-sales-order.dto';
import { applyDiscount, DiscountType } from '../common/discount.util';
import { computeTaxAmount } from '../common/tax.util';
import { NotificationsService } from '../notifications/notifications.service';

const DETAIL_INCLUDE = {
  items: { include: { product: true } },
  warehouse: true,
  user: { select: { id: true, name: true, email: true } },
  customer: true,
  deliveries: { include: { items: { include: { product: true } } }, orderBy: { createdAt: 'desc' as const } },
  invoices: { orderBy: { createdAt: 'desc' as const } },
  tax: true,
};

@Injectable()
export class SalesOrdersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // Every Sales Order starts life as a DRAFT — merchandiser assignment always happens via
  // confirm(), whether this order came from a converted Quotation or was created directly.
  // No stock, no batch, no invoice here — those belong to Delivery/Invoice respectively.
  async create(dto: CreateSalesOrderDto) {
    // Line discount is baked into the stored net `price` here — everything downstream (Invoice,
    // Delivery COGS, GL) keeps reading `price` exactly as before, discounted or not.
    const items = dto.items.map((i) => {
      const listPrice = i.listPrice ?? i.price;
      const price = applyDiscount(listPrice, i.lineDiscountType, i.lineDiscountValue);
      return { ...i, listPrice: i.listPrice ?? null, price };
    });
    const subtotal = items.reduce((sum, i) => sum + i.quantity * i.price, 0);
    const netAfterDiscount = applyDiscount(subtotal, dto.discountType, dto.discountValue);
    const taxAmount = await computeTaxAmount(this.prisma, dto.taxId, netAfterDiscount);
    const totalAmount = netAfterDiscount + taxAmount;

    let clientName = dto.clientName;
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (customer) clientName = customer.name;
    }

    return this.prisma.salesOrder.create({
      data: {
        warehouseId: dto.warehouseId,
        clientName,
        customerId: dto.customerId,
        customerReference: dto.customerReference,
        termsAndConditions: dto.termsAndConditions,
        discountType: dto.discountType,
        discountValue: dto.discountValue ?? 0,
        taxId: dto.taxId,
        taxAmount,
        costCenterId: dto.costCenterId,
        subtotal,
        totalAmount,
        items: {
          create: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: i.price,
            listPrice: i.listPrice,
            lineDiscountType: i.lineDiscountType,
            lineDiscountValue: i.lineDiscountValue ?? 0,
          })),
        },
      },
      include: DETAIL_INCLUDE,
    });
  }

  // Used internally by QuotationsService.convert() — same shape, just named for that call site.
  // The Quotation already computed final net prices/subtotal/totalAmount, so this is a pure
  // carry-forward, not a recomputation.
  async createFromQuotation(dto: {
    warehouseId: number;
    clientName?: string;
    customerId?: number;
    customerReference?: string;
    termsAndConditions?: string;
    discountType?: DiscountType | null;
    discountValue?: number;
    taxId?: number | null;
    taxAmount?: number;
    subtotal: number;
    totalAmount: number;
    items: {
      productId: number;
      quantity: number;
      price: number;
      listPrice?: number | null;
      lineDiscountType?: DiscountType | null;
      lineDiscountValue?: number;
    }[];
  }) {
    return this.prisma.salesOrder.create({
      data: {
        warehouseId: dto.warehouseId,
        clientName: dto.clientName,
        customerId: dto.customerId,
        customerReference: dto.customerReference,
        termsAndConditions: dto.termsAndConditions,
        discountType: dto.discountType,
        discountValue: dto.discountValue ?? 0,
        taxId: dto.taxId,
        taxAmount: dto.taxAmount ?? 0,
        subtotal: dto.subtotal,
        totalAmount: dto.totalAmount,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: i.price,
            listPrice: i.listPrice,
            lineDiscountType: i.lineDiscountType,
            lineDiscountValue: i.lineDiscountValue ?? 0,
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
        customer: true,
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

    const updated = await this.prisma.salesOrder.update({
      where: { id },
      data: { userId: dto.userId, status: 'CONFIRMED' },
      include: DETAIL_INCLUDE,
    });
    this.notifications.notifyOrderConfirmed(updated).catch(() => {});
    return updated;
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

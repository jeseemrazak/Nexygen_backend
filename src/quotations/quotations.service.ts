import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationStatusDto } from './dto/update-quotation-status.dto';
import { applyDiscount } from '../common/discount.util';

@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private salesOrdersService: SalesOrdersService,
  ) {}

  async create(dto: CreateQuotationDto) {
    // Line discount is baked into the stored net `price` here — the same convention used by
    // SalesOrder, so a converted Quotation's numbers carry over with no recomputation.
    const items = dto.items.map((i) => {
      const listPrice = i.listPrice ?? i.price;
      const price = applyDiscount(listPrice, i.lineDiscountType, i.lineDiscountValue);
      return { ...i, listPrice: i.listPrice ?? null, price };
    });
    const subtotal = items.reduce((sum, i) => sum + i.quantity * i.price, 0);
    const totalAmount = applyDiscount(subtotal, dto.discountType, dto.discountValue);

    let clientName = dto.clientName;
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (customer) clientName = customer.name;
    }

    return this.prisma.quotation.create({
      data: {
        userId: dto.userId,
        warehouseId: dto.warehouseId,
        clientName,
        customerId: dto.customerId,
        customerReference: dto.customerReference,
        termsAndConditions: dto.termsAndConditions,
        discountType: dto.discountType,
        discountValue: dto.discountValue ?? 0,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
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
      include: { items: { include: { product: true } }, user: true, warehouse: true, customer: true },
    });
  }

  async findAll(status?: string) {
    const where: any = {};
    if (status && status !== 'ALL') where.status = status;

    return this.prisma.quotation.findMany({
      where,
      include: { items: true, user: { select: { name: true, email: true } }, warehouse: true, customer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.quotation.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        user: { select: { name: true, email: true } },
        warehouse: true,
        customer: true,
        convertedOrder: true,
      },
    });
  }

  async updateStatus(id: number, dto: UpdateQuotationStatusDto) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw new NotFoundException(`Quotation ${id} not found`);
    if (quotation.status === 'CONVERTED') {
      throw new BadRequestException('Cannot change the status of a converted quotation');
    }

    return this.prisma.quotation.update({ where: { id }, data: { status: dto.status } });
  }

  // 🔁 Converts an accepted quotation into a DRAFT Sales Order. Nothing is committed yet —
  // merchandiser is assigned afterward, when the Sales Order is confirmed.
  async convert(id: number) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id }, include: { items: true } });
    if (!quotation) throw new NotFoundException(`Quotation ${id} not found`);
    if (quotation.status === 'REJECTED' || quotation.status === 'CONVERTED') {
      throw new BadRequestException(`Cannot convert a ${quotation.status} quotation`);
    }

    const order = await this.salesOrdersService.createFromQuotation({
      warehouseId: quotation.warehouseId,
      clientName: quotation.clientName ?? undefined,
      customerId: quotation.customerId ?? undefined,
      customerReference: quotation.customerReference ?? undefined,
      termsAndConditions: quotation.termsAndConditions ?? undefined,
      discountType: quotation.discountType as 'PERCENT' | 'AMOUNT' | null,
      discountValue: quotation.discountValue,
      subtotal: quotation.subtotal,
      items: quotation.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.price,
        listPrice: i.listPrice,
        lineDiscountType: i.lineDiscountType as 'PERCENT' | 'AMOUNT' | null,
        lineDiscountValue: i.lineDiscountValue,
      })),
      totalAmount: quotation.totalAmount,
    });

    return this.prisma.quotation.update({
      where: { id },
      data: { status: 'CONVERTED', convertedOrderId: order.id },
      include: { items: { include: { product: true } }, convertedOrder: true },
    });
  }
}

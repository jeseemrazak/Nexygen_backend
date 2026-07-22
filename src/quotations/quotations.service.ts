import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationStatusDto } from './dto/update-quotation-status.dto';

@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private salesOrdersService: SalesOrdersService,
  ) {}

  async create(dto: CreateQuotationDto) {
    const totalAmount = dto.items.reduce((sum, i) => sum + i.quantity * i.price, 0);

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
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        totalAmount,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            price: i.price,
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
      items: quotation.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.price,
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

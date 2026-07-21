import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { CreateRfqResponseDto } from './dto/create-rfq-response.dto';

@Injectable()
export class RfqsService {
  constructor(
    private prisma: PrismaService,
    private purchaseOrdersService: PurchaseOrdersService,
  ) {}

  async create(dto: CreateRfqDto) {
    return this.prisma.rFQ.create({
      data: {
        warehouseId: dto.warehouseId,
        items: {
          create: dto.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        },
      },
      include: { items: { include: { product: true } }, warehouse: true },
    });
  }

  async findAll(status?: string) {
    const where: any = {};
    if (status && status !== 'ALL') where.status = status;

    return this.prisma.rFQ.findMany({
      where,
      include: {
        warehouse: true,
        items: { include: { product: true } },
        responses: { include: { supplier: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.rFQ.findUnique({
      where: { id },
      include: {
        warehouse: true,
        items: { include: { product: true } },
        responses: {
          include: { supplier: true, items: { include: { product: true } } },
          orderBy: { totalAmount: 'asc' },
        },
      },
    });
  }

  // 📩 Record a supplier's quoted pricing against this RFQ's requested items.
  async createResponse(rfqId: number, dto: CreateRfqResponseDto) {
    const rfq = await this.prisma.rFQ.findUnique({ where: { id: rfqId }, include: { items: true } });
    if (!rfq) throw new NotFoundException(`RFQ ${rfqId} not found`);
    if (rfq.status === 'CONVERTED' || rfq.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot record a response against a ${rfq.status} RFQ`);
    }

    let totalAmount = 0;
    for (const responseItem of dto.items) {
      const rfqItem = rfq.items.find((i) => i.productId === responseItem.productId);
      if (!rfqItem) {
        throw new BadRequestException(`Product ${responseItem.productId} is not part of RFQ #${rfqId}`);
      }
      totalAmount += rfqItem.quantity * responseItem.unitCost;
    }

    return this.prisma.rFQResponse.create({
      data: {
        rfqId,
        supplierId: dto.supplierId,
        totalAmount,
        items: {
          create: dto.items.map((i) => ({ productId: i.productId, unitCost: i.unitCost })),
        },
      },
      include: { supplier: true, items: { include: { product: true } } },
    });
  }

  // 🏆 Picks a supplier's response and converts it into a real PurchaseOrder,
  // reusing PurchaseOrdersService.create so the PO lifecycle stays in one place.
  async convertToPurchaseOrder(rfqId: number, responseId: number) {
    const rfq = await this.prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: { items: true, responses: { include: { items: true } } },
    });
    if (!rfq) throw new NotFoundException(`RFQ ${rfqId} not found`);
    if (rfq.status === 'CONVERTED' || rfq.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot convert a ${rfq.status} RFQ`);
    }

    const response = rfq.responses.find((r) => r.id === responseId);
    if (!response) throw new BadRequestException(`Response ${responseId} is not part of RFQ #${rfqId}`);
    if (response.status === 'REJECTED') throw new BadRequestException('Cannot convert a rejected response');

    const items = rfq.items.map((rfqItem) => {
      const responseItem = response.items.find((ri) => ri.productId === rfqItem.productId);
      if (!responseItem) {
        throw new BadRequestException(`Response ${responseId} is missing a price for product ${rfqItem.productId}`);
      }
      return {
        productId: rfqItem.productId,
        quantityOrdered: rfqItem.quantity,
        unitCost: responseItem.unitCost,
      };
    });

    const po = await this.purchaseOrdersService.create({
      supplierId: response.supplierId,
      warehouseId: rfq.warehouseId,
      items,
    });

    await this.prisma.rFQResponse.update({
      where: { id: responseId },
      data: { status: 'SELECTED', convertedPurchaseOrderId: po!.id },
    });
    await this.prisma.rFQResponse.updateMany({
      where: { rfqId, id: { not: responseId } },
      data: { status: 'REJECTED' },
    });
    await this.prisma.rFQ.update({ where: { id: rfqId }, data: { status: 'CONVERTED' } });

    return this.findOne(rfqId);
  }
}

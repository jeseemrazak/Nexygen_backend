import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { computeTaxAmount } from '../common/tax.util';

@Injectable()
export class PurchaseOrdersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePurchaseOrderDto) {
    const subtotal = dto.items.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0);
    const taxAmount = await computeTaxAmount(this.prisma, dto.taxId, subtotal);
    const totalAmount = subtotal + taxAmount;

    return this.prisma.purchaseOrder.create({
      data: {
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        reference: dto.reference,
        taxId: dto.taxId,
        taxAmount,
        totalAmount,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            quantityOrdered: i.quantityOrdered,
            unitCost: i.unitCost,
          })),
        },
      },
      include: { items: { include: { product: true } }, supplier: true, warehouse: true },
    });
  }

  async findAll(status?: string, supplierId?: string) {
    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    if (supplierId) where.supplierId = Number(supplierId);

    return this.prisma.purchaseOrder.findMany({
      where,
      include: { supplier: true, warehouse: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        warehouse: true,
        items: { include: { product: true } },
        receipts: { include: { items: { include: { product: true } } }, orderBy: { createdAt: 'desc' } },
        bills: { include: { items: true }, orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async update(id: number, dto: UpdatePurchaseOrderDto) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException(`Purchase order ${id} not found`);
    if (po.status !== 'DRAFT') throw new BadRequestException('Only draft purchase orders can be edited');

    const { items, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderItem.createMany({
          data: items.map((i) => ({
            purchaseOrderId: id,
            productId: i.productId,
            quantityOrdered: i.quantityOrdered,
            unitCost: i.unitCost,
          })),
        });
      }

      let totalAmount: number | undefined;
      let taxAmount: number | undefined;
      if (items || rest.taxId !== undefined) {
        const subtotal = items ? items.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0) : po.totalAmount - po.taxAmount;
        const effectiveTaxId = rest.taxId !== undefined ? rest.taxId : po.taxId;
        taxAmount = await computeTaxAmount(tx, effectiveTaxId, subtotal);
        totalAmount = subtotal + taxAmount;
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: { ...rest, ...(taxAmount !== undefined && { taxAmount }), ...(totalAmount !== undefined && { totalAmount }) },
        include: { items: { include: { product: true } }, supplier: true, warehouse: true },
      });
    });
  }

  async markOrdered(id: number) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException(`Purchase order ${id} not found`);
    if (po.status !== 'DRAFT') throw new BadRequestException('Only draft purchase orders can be marked as ordered');

    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'ORDERED' } });
  }

  async remove(id: number) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException(`Purchase order ${id} not found`);
    if (po.status !== 'DRAFT') throw new BadRequestException('Only draft purchase orders can be deleted');

    return this.prisma.purchaseOrder.delete({ where: { id } });
  }
}

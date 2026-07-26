import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobOrderDto } from './dto/create-job-order.dto';
import { UpdateJobOrderDto } from './dto/update-job-order.dto';
import { AddJobOrderPartDto } from './dto/add-part.dto';
import { AddJobOrderLaborDto } from './dto/add-labor.dto';

const DETAIL_INCLUDE = {
  vehicle: true,
  customer: true,
  technician: { select: { id: true, name: true, email: true } },
  warehouse: true,
  parts: { include: { product: true }, orderBy: { createdAt: 'asc' as const } },
  laborLines: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class JobOrdersService {
  constructor(private prisma: PrismaService) {}

  // A job order starts life OPEN with zero totals — parts/labor get added as work happens,
  // same "build it up incrementally" shape as a POS cart, not a fixed line-item document
  // created all at once like a Sales Order.
  async create(dto: CreateJobOrderDto) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: dto.vehicleId } });
    if (!vehicle) throw new NotFoundException(`Vehicle ${dto.vehicleId} not found`);

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new NotFoundException(`Warehouse ${dto.warehouseId} not found`);

    const jobOrder = await this.prisma.jobOrder.create({
      data: {
        jobNumber: 'PENDING',
        vehicleId: dto.vehicleId,
        customerId: dto.customerId ?? vehicle.customerId ?? undefined,
        technicianId: dto.technicianId,
        warehouseId: dto.warehouseId,
        description: dto.description,
        odometerReading: dto.odometerReading,
        notes: dto.notes,
      },
    });
    return this.prisma.jobOrder.update({
      where: { id: jobOrder.id },
      data: { jobNumber: `JO-${String(jobOrder.id).padStart(6, '0')}` },
      include: DETAIL_INCLUDE,
    });
  }

  async findAll(filters?: { vehicleId?: number; customerId?: number; status?: string }) {
    return this.prisma.jobOrder.findMany({
      where: {
        vehicleId: filters?.vehicleId,
        customerId: filters?.customerId,
        status: filters?.status as any,
      },
      include: {
        vehicle: true,
        customer: true,
        technician: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const jobOrder = await this.prisma.jobOrder.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!jobOrder) throw new NotFoundException(`Job Order ${id} not found`);
    return jobOrder;
  }

  async update(id: number, dto: UpdateJobOrderDto) {
    await this.assertMutable(id);
    return this.prisma.jobOrder.update({ where: { id }, data: dto, include: DETAIL_INCLUDE });
  }

  private async assertMutable(id: number) {
    const jobOrder = await this.prisma.jobOrder.findUnique({ where: { id } });
    if (!jobOrder) throw new NotFoundException(`Job Order ${id} not found`);
    if (jobOrder.status === 'COMPLETED' || jobOrder.status === 'CANCELLED') {
      throw new BadRequestException(`Job Order ${id} is ${jobOrder.status.toLowerCase()} and can no longer be modified`);
    }
    return jobOrder;
  }

  // Parts are deducted from stock the moment they're added — same immediate-deduction
  // convention as POS/Delivery — not held back until the job order is marked COMPLETED.
  async addPart(jobOrderId: number, dto: AddJobOrderPartDto) {
    const jobOrder = await this.assertMutable(jobOrderId);
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException(`Product ${dto.productId} not found`);

    const isService = product.type === 'SERVICE';

    return this.prisma.$transaction(async (tx) => {
      let costPrice = product.costPrice;
      if (!isService) {
        const inv = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_batchNumber: {
              productId: dto.productId,
              warehouseId: jobOrder.warehouseId,
              batchNumber: dto.batchNumber,
            },
          },
        });
        costPrice = inv && inv.unitCost > 0 ? inv.unitCost : product.costPrice;

        // Same atomic conditional-decrement guard as POS/Delivery — the stock-sufficiency
        // check and the decrement happen as one statement, not read-then-write.
        const deducted = await tx.inventory.updateMany({
          where: {
            productId: dto.productId,
            warehouseId: jobOrder.warehouseId,
            batchNumber: dto.batchNumber,
            quantity: { gte: dto.quantity },
          },
          data: { quantity: { decrement: dto.quantity } },
        });
        if (deducted.count === 0) {
          throw new BadRequestException(`Insufficient stock for Product #${dto.productId} (Batch: ${dto.batchNumber}).`);
        }
      }

      await tx.jobOrderPart.create({
        data: {
          jobOrderId,
          productId: dto.productId,
          batchNumber: isService ? 'SERVICE' : dto.batchNumber,
          quantity: dto.quantity,
          unitPrice: product.price,
          costPrice,
        },
      });

      const lineTotal = dto.quantity * product.price;
      const updated = await tx.jobOrder.update({
        where: { id: jobOrderId },
        data: {
          partsTotal: { increment: lineTotal },
          totalAmount: { increment: lineTotal },
        },
      });

      return tx.jobOrder.findUnique({ where: { id: updated.id }, include: DETAIL_INCLUDE });
    });
  }

  async removePart(jobOrderId: number, partId: number) {
    await this.assertMutable(jobOrderId);
    const part = await this.prisma.jobOrderPart.findUnique({ where: { id: partId } });
    if (!part || part.jobOrderId !== jobOrderId) throw new NotFoundException(`Part ${partId} not found on Job Order ${jobOrderId}`);

    return this.prisma.$transaction(async (tx) => {
      if (part.batchNumber !== 'SERVICE') {
        const jobOrder = await tx.jobOrder.findUniqueOrThrow({ where: { id: jobOrderId } });
        await tx.inventory.update({
          where: {
            productId_warehouseId_batchNumber: {
              productId: part.productId,
              warehouseId: jobOrder.warehouseId,
              batchNumber: part.batchNumber,
            },
          },
          data: { quantity: { increment: part.quantity } },
        });
      }

      await tx.jobOrderPart.delete({ where: { id: partId } });

      const lineTotal = part.quantity * part.unitPrice;
      await tx.jobOrder.update({
        where: { id: jobOrderId },
        data: {
          partsTotal: { decrement: lineTotal },
          totalAmount: { decrement: lineTotal },
        },
      });

      return tx.jobOrder.findUnique({ where: { id: jobOrderId }, include: DETAIL_INCLUDE });
    });
  }

  async addLabor(jobOrderId: number, dto: AddJobOrderLaborDto) {
    await this.assertMutable(jobOrderId);
    await this.prisma.jobOrderLabor.create({
      data: {
        jobOrderId,
        description: dto.description,
        hours: dto.hours,
        rate: dto.rate,
        amount: dto.amount,
      },
    });
    await this.prisma.jobOrder.update({
      where: { id: jobOrderId },
      data: { laborTotal: { increment: dto.amount }, totalAmount: { increment: dto.amount } },
    });
    return this.findOne(jobOrderId);
  }

  async removeLabor(jobOrderId: number, laborId: number) {
    await this.assertMutable(jobOrderId);
    const labor = await this.prisma.jobOrderLabor.findUnique({ where: { id: laborId } });
    if (!labor || labor.jobOrderId !== jobOrderId) throw new NotFoundException(`Labor line ${laborId} not found on Job Order ${jobOrderId}`);

    await this.prisma.jobOrderLabor.delete({ where: { id: laborId } });
    await this.prisma.jobOrder.update({
      where: { id: jobOrderId },
      data: { laborTotal: { decrement: labor.amount }, totalAmount: { decrement: labor.amount } },
    });
    return this.findOne(jobOrderId);
  }

  // OPEN -> IN_PROGRESS -> COMPLETED, or -> CANCELLED from either open state. Cancelling
  // restocks every non-service part still on the job order (mirrors PosSalesService.cancel())
  // so a cancelled job order never leaves stock silently short.
  async updateStatus(id: number, status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') {
    const jobOrder = await this.prisma.jobOrder.findUnique({ where: { id }, include: { parts: true } });
    if (!jobOrder) throw new NotFoundException(`Job Order ${id} not found`);
    if (jobOrder.status === 'COMPLETED' || jobOrder.status === 'CANCELLED') {
      throw new BadRequestException(`Job Order ${id} is already ${jobOrder.status.toLowerCase()}`);
    }

    if (status === 'CANCELLED') {
      return this.prisma.$transaction(async (tx) => {
        for (const part of jobOrder.parts) {
          if (part.batchNumber === 'SERVICE') continue;
          await tx.inventory.update({
            where: {
              productId_warehouseId_batchNumber: {
                productId: part.productId,
                warehouseId: jobOrder.warehouseId,
                batchNumber: part.batchNumber,
              },
            },
            data: { quantity: { increment: part.quantity } },
          });
        }
        return tx.jobOrder.update({ where: { id }, data: { status: 'CANCELLED' }, include: DETAIL_INCLUDE });
      });
    }

    return this.prisma.jobOrder.update({
      where: { id },
      data: { status, completedAt: status === 'COMPLETED' ? new Date() : undefined },
      include: DETAIL_INCLUDE,
    });
  }
}

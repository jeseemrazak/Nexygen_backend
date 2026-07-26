import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateVehicleDto) {
    return this.prisma.vehicle.create({ data: dto, include: { customer: true } });
  }

  async findAll(customerId?: number) {
    return this.prisma.vehicle.findMany({
      where: customerId ? { customerId } : undefined,
      include: { customer: true, _count: { select: { jobOrders: true } } },
      orderBy: { plateNumber: 'asc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        customer: true,
        jobOrders: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async update(id: number, dto: UpdateVehicleDto) {
    return this.prisma.vehicle.update({ where: { id }, data: dto, include: { customer: true } });
  }

  async remove(id: number) {
    const jobOrderCount = await this.prisma.jobOrder.count({ where: { vehicleId: id } });
    if (jobOrderCount > 0) {
      throw new BadRequestException(`Cannot delete this vehicle — it has ${jobOrderCount} job order(s) on record`);
    }
    return this.prisma.vehicle.delete({ where: { id } });
  }
}

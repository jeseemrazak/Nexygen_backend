import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitOfMeasurementDto } from './dto/create-unit-of-measurement.dto';

@Injectable()
export class UnitsOfMeasurementService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUnitOfMeasurementDto) {
    return this.prisma.unitOfMeasurement.create({ data: dto });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.unitOfMeasurement.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async update(id: number, dto: Partial<CreateUnitOfMeasurementDto>) {
    const unit = await this.prisma.unitOfMeasurement.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException(`Unit of measurement ${id} not found`);
    return this.prisma.unitOfMeasurement.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const count = await this.prisma.product.count({ where: { unitId: id } });
    if (count > 0) {
      throw new BadRequestException(`Cannot delete unit — it has ${count} product(s) assigned to it. Deactivate it instead.`);
    }
    return this.prisma.unitOfMeasurement.delete({ where: { id } });
  }
}

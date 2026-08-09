import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';

@Injectable()
export class CostCentersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCostCenterDto) {
    return this.prisma.costCenter.create({ data: dto });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.costCenter.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: number) {
    const cc = await this.prisma.costCenter.findUnique({ where: { id } });
    if (!cc) throw new NotFoundException(`Cost center ${id} not found`);
    return cc;
  }

  async update(id: number, dto: UpdateCostCenterDto) {
    const cc = await this.prisma.costCenter.findUnique({ where: { id } });
    if (!cc) throw new NotFoundException(`Cost center ${id} not found`);
    return this.prisma.costCenter.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const cc = await this.prisma.costCenter.findUnique({ where: { id } });
    if (!cc) throw new NotFoundException(`Cost center ${id} not found`);
    return this.prisma.costCenter.delete({ where: { id } });
  }
}

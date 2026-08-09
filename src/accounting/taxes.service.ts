import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxDto } from './dto/create-tax.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';

@Injectable()
export class TaxesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTaxDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.tax.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.tax.create({ data: dto });
    });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.tax.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const tax = await this.prisma.tax.findUnique({ where: { id } });
    if (!tax) throw new NotFoundException(`Tax ${id} not found`);
    return tax;
  }

  async update(id: number, dto: UpdateTaxDto) {
    const tax = await this.prisma.tax.findUnique({ where: { id } });
    if (!tax) throw new NotFoundException(`Tax ${id} not found`);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.tax.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      return tx.tax.update({ where: { id }, data: dto });
    });
  }

  async remove(id: number) {
    const tax = await this.prisma.tax.findUnique({ where: { id } });
    if (!tax) throw new NotFoundException(`Tax ${id} not found`);
    return this.prisma.tax.delete({ where: { id } });
  }
}

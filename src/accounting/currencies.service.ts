import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@Injectable()
export class CurrenciesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCurrencyDto) {
    return this.prisma.currency.create({ data: { ...dto, code: dto.code.toUpperCase() } });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.currency.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: number) {
    const currency = await this.prisma.currency.findUnique({ where: { id } });
    if (!currency) throw new NotFoundException(`Currency ${id} not found`);
    return currency;
  }

  async update(id: number, dto: UpdateCurrencyDto) {
    const currency = await this.prisma.currency.findUnique({ where: { id } });
    if (!currency) throw new NotFoundException(`Currency ${id} not found`);
    return this.prisma.currency.update({
      where: { id },
      data: { ...dto, code: dto.code ? dto.code.toUpperCase() : undefined },
    });
  }

  async remove(id: number) {
    const currency = await this.prisma.currency.findUnique({ where: { id } });
    if (!currency) throw new NotFoundException(`Currency ${id} not found`);
    return this.prisma.currency.delete({ where: { id } });
  }
}

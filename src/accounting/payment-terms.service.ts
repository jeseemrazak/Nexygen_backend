import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';

@Injectable()
export class PaymentTermsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePaymentTermDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.paymentTerm.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.paymentTerm.create({ data: dto });
    });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.paymentTerm.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { days: 'asc' },
    });
  }

  async findOne(id: number) {
    const term = await this.prisma.paymentTerm.findUnique({ where: { id } });
    if (!term) throw new NotFoundException(`Payment term ${id} not found`);
    return term;
  }

  async update(id: number, dto: UpdatePaymentTermDto) {
    const term = await this.prisma.paymentTerm.findUnique({ where: { id } });
    if (!term) throw new NotFoundException(`Payment term ${id} not found`);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.paymentTerm.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      return tx.paymentTerm.update({ where: { id }, data: dto });
    });
  }

  async remove(id: number) {
    const term = await this.prisma.paymentTerm.findUnique({ where: { id } });
    if (!term) throw new NotFoundException(`Payment term ${id} not found`);
    return this.prisma.paymentTerm.delete({ where: { id } });
  }
}

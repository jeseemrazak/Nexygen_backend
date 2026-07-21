import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePayrollConfigDto } from './dto/update-payroll-config.dto';

@Injectable()
export class PayrollConfigService {
  constructor(private prisma: PrismaService) {}

  // Single-row settings table — created lazily with defaults on first read/write.
  async get() {
    const existing = await this.prisma.payrollConfig.findFirst();
    if (existing) return existing;
    return this.prisma.payrollConfig.create({ data: {} });
  }

  async update(dto: UpdatePayrollConfigDto) {
    const config = await this.get();
    return this.prisma.payrollConfig.update({ where: { id: config.id }, data: dto });
  }
}

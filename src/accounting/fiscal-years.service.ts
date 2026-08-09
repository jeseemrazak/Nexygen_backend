import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFiscalYearDto } from './dto/create-fiscal-year.dto';

@Injectable()
export class FiscalYearsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateFiscalYearDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate + 'T23:59:59.999Z');
    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // Ranges may not overlap an existing fiscal year — every posted entry must fall inside
    // exactly zero or one fiscal year, so the lock check in JournalService is never ambiguous.
    const overlapping = await this.prisma.fiscalYear.findFirst({
      where: { startDate: { lte: endDate }, endDate: { gte: startDate } },
    });
    if (overlapping) {
      throw new BadRequestException(`Overlaps existing fiscal year "${overlapping.name}"`);
    }

    return this.prisma.fiscalYear.create({ data: { name: dto.name, startDate, endDate } });
  }

  async findAll() {
    return this.prisma.fiscalYear.findMany({ orderBy: { startDate: 'desc' } });
  }

  async findOne(id: number) {
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id } });
    if (!fy) throw new NotFoundException(`Fiscal year ${id} not found`);
    return fy;
  }

  async lock(id: number) {
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id } });
    if (!fy) throw new NotFoundException(`Fiscal year ${id} not found`);
    if (fy.status === 'LOCKED') throw new BadRequestException(`Fiscal year "${fy.name}" is already locked`);
    return this.prisma.fiscalYear.update({ where: { id }, data: { status: 'LOCKED', lockedAt: new Date() } });
  }

  async unlock(id: number) {
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id } });
    if (!fy) throw new NotFoundException(`Fiscal year ${id} not found`);
    if (fy.status === 'OPEN') throw new BadRequestException(`Fiscal year "${fy.name}" is already open`);
    return this.prisma.fiscalYear.update({ where: { id }, data: { status: 'OPEN', lockedAt: null } });
  }

  async remove(id: number) {
    const fy = await this.prisma.fiscalYear.findUnique({ where: { id } });
    if (!fy) throw new NotFoundException(`Fiscal year ${id} not found`);
    if (fy.status === 'LOCKED') throw new BadRequestException(`Unlock "${fy.name}" before deleting it`);
    return this.prisma.fiscalYear.delete({ where: { id } });
  }
}

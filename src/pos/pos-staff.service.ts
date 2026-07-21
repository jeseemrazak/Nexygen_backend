import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePosStaffDto } from './dto/create-pos-staff.dto';
import { UpdatePosStaffDto } from './dto/update-pos-staff.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';

const SAFE_SELECT = { id: true, name: true, isActive: true, createdAt: true };

@Injectable()
export class PosStaffService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePosStaffDto) {
    const pinHash = await bcrypt.hash(dto.pin, 10);
    return this.prisma.posStaff.create({ data: { name: dto.name, pinHash }, select: SAFE_SELECT });
  }

  async findAll(activeOnly?: boolean) {
    return this.prisma.posStaff.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      select: SAFE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const staff = await this.prisma.posStaff.findUnique({ where: { id }, select: SAFE_SELECT });
    if (!staff) throw new NotFoundException(`POS staff ${id} not found`);
    return staff;
  }

  async update(id: number, dto: UpdatePosStaffDto) {
    const staff = await this.prisma.posStaff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException(`POS staff ${id} not found`);

    const data: any = { name: dto.name, isActive: dto.isActive };
    if (dto.pin) data.pinHash = await bcrypt.hash(dto.pin, 10);

    return this.prisma.posStaff.update({ where: { id }, data, select: SAFE_SELECT });
  }

  async remove(id: number) {
    const staff = await this.prisma.posStaff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException(`POS staff ${id} not found`);
    return this.prisma.posStaff.delete({ where: { id } });
  }

  // PIN check for per-sale attribution only — not a login/session, no JWT issued.
  async verifyPin(id: number, dto: VerifyPinDto) {
    const staff = await this.prisma.posStaff.findUnique({ where: { id } });
    if (!staff || !staff.isActive) throw new UnauthorizedException('Invalid staff or inactive');

    const valid = await bcrypt.compare(dto.pin, staff.pinHash);
    if (!valid) throw new UnauthorizedException('Incorrect PIN');

    return { id: staff.id, name: staff.name, verified: true };
  }
}

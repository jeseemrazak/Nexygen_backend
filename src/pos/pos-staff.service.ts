import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePosStaffDto } from './dto/create-pos-staff.dto';
import { UpdatePosStaffDto } from './dto/update-pos-staff.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';

const SAFE_SELECT = { id: true, name: true, isActive: true, createdAt: true };
const STAFF_TOKEN_TYPE = 'pos-staff';

@Injectable()
export class PosStaffService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

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

  // PIN check for per-sale attribution — not a dashboard login (no ADMIN/MERCHANDISER role
  // involved), but callers (checkout, session open/close, sale cancel) need proof the PIN was
  // actually verified rather than trusting a raw staff id from the request body. Issues a
  // short-lived signed token carrying the verified staff id; callers pass that token back
  // instead of an id, and `resolveStaffToken` below verifies it server-side.
  async verifyPin(id: number, dto: VerifyPinDto) {
    const staff = await this.prisma.posStaff.findUnique({ where: { id } });
    if (!staff || !staff.isActive) throw new UnauthorizedException('Invalid staff or inactive');

    const valid = await bcrypt.compare(dto.pin, staff.pinHash);
    if (!valid) throw new UnauthorizedException('Incorrect PIN');

    const staffToken = await this.jwtService.signAsync(
      { sub: staff.id, name: staff.name, type: STAFF_TOKEN_TYPE },
      { expiresIn: '12h' },
    );

    return { id: staff.id, name: staff.name, verified: true, staffToken };
  }

  // Verifies a staffToken issued by verifyPin above and returns the real, verified staff id —
  // used by pos-sales/pos-sessions instead of trusting a client-supplied servedById/openedById/
  // closedById/cancelledById directly. Returns null (not an error) when no token was supplied,
  // since PIN entry is optional at checkout — an invalid/expired token IS an error, since that
  // means someone is claiming attribution without a real verified PIN.
  async resolveStaffToken(token?: string): Promise<number | undefined> {
    if (!token) return undefined;
    try {
      const payload = await this.jwtService.verifyAsync(token);
      if (payload.type !== STAFF_TOKEN_TYPE || typeof payload.sub !== 'number') {
        throw new UnauthorizedException('Invalid staff token');
      }
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired staff token — please re-enter your PIN');
    }
  }
}

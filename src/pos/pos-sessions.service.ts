import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';

const DETAIL_INCLUDE = {
  warehouse: true,
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  sales: { include: { items: { include: { product: true } }, paymentMethod: true, servedBy: { select: { id: true, name: true } } } },
};

@Injectable()
export class PosSessionsService {
  constructor(private prisma: PrismaService) {}

  // Sessions are simple open/close time markers — no starting-cash or reconciliation fields,
  // matching the reference: a session's sales are whatever falls inside its time window.
  async open(dto: OpenSessionDto) {
    const openSession = await this.prisma.posSession.findFirst({ where: { warehouseId: dto.warehouseId, status: 'OPEN' } });
    if (openSession) {
      throw new BadRequestException(`Warehouse ${dto.warehouseId} already has an open session (#${openSession.id})`);
    }
    return this.prisma.posSession.create({
      data: { warehouseId: dto.warehouseId, openedById: dto.openedById },
      include: DETAIL_INCLUDE,
    });
  }

  async close(id: number, dto: CloseSessionDto) {
    const session = await this.prisma.posSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    if (session.status === 'CLOSED') throw new BadRequestException(`Session ${id} is already closed`);

    return this.prisma.posSession.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date(), closedById: dto.closedById },
      include: DETAIL_INCLUDE,
    });
  }

  async findAll(warehouseId?: number) {
    return this.prisma.posSession.findMany({
      where: warehouseId ? { warehouseId } : undefined,
      include: {
        warehouse: true,
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        _count: { select: { sales: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const session = await this.prisma.posSession.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    return session;
  }

  // Which open session (if any) a warehouse currently has — the checkout screen needs this
  // before it can create a sale.
  async findOpenForWarehouse(warehouseId: number) {
    return this.prisma.posSession.findFirst({ where: { warehouseId, status: 'OPEN' }, include: DETAIL_INCLUDE });
  }
}

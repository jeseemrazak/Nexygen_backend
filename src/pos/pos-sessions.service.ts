import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountMappingRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../accounting/journal.service';
import { PosStaffService } from './pos-staff.service';
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
  constructor(
    private prisma: PrismaService,
    private posStaffService: PosStaffService,
    private journalService: JournalService,
  ) {}

  // A session's sales are whatever falls inside its open/close time window. Cash reconciliation
  // is optional — openingCash/countedCash are only stored when the till was actually counted;
  // expectedCash/cashVariance are always server-computed, never accepted from the client.
  async open(dto: OpenSessionDto) {
    const openSession = await this.prisma.posSession.findFirst({ where: { warehouseId: dto.warehouseId, status: 'OPEN' } });
    if (openSession) {
      throw new BadRequestException(`Warehouse ${dto.warehouseId} already has an open session (#${openSession.id})`);
    }
    const openedById = await this.posStaffService.resolveStaffToken(dto.openedByToken);
    return this.prisma.posSession.create({
      data: { warehouseId: dto.warehouseId, openedById, openingCash: dto.openingCash },
      include: DETAIL_INCLUDE,
    });
  }

  async close(id: number, dto: CloseSessionDto) {
    const session = await this.prisma.posSession.findUnique({ where: { id }, include: { warehouse: true } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    if (session.status === 'CLOSED') throw new BadRequestException(`Session ${id} is already closed`);

    const closedById = await this.posStaffService.resolveStaffToken(dto.closedByToken);

    // Expected cash = opening float + this session's non-cancelled sales paid through a
    // cash-type journal (card/bank payment methods don't touch the physical drawer).
    const cashSales = await this.prisma.posSale.findMany({
      where: { sessionId: id, cancelledAt: null, paymentMethod: { journal: { type: 'CASH' } } },
      select: { totalAmount: true },
    });
    const cashSalesTotal = cashSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const expectedCash = (session.openingCash ?? 0) + cashSalesTotal;
    const cashVariance = dto.countedCash != null ? dto.countedCash - expectedCash : null;

    // Post cash variance GL entries if a counted cash amount was provided and there's a variance
    if (cashVariance != null && cashVariance !== 0) {
      const variance = Math.abs(cashVariance);
      const isGain = cashVariance > 0;
      const role = isGain ? AccountMappingRole.CASH_DIFFERENCE_GAIN : AccountMappingRole.CASH_DIFFERENCE_LOSS;
      const cashAccountId = await this.journalService.getMappedAccountId(this.prisma, AccountMappingRole.CASH_BANK);
      const varianceAccountId = await this.journalService.getMappedAccountId(this.prisma, role);

      await this.journalService.postEntry(this.prisma, {
        sourceType: 'POS_SESSION_VARIANCE',
        sourceId: id,
        memo: `Cash variance for POS session #${id} (${session.warehouse.name})`,
        lines: isGain
          ? [
              { accountId: cashAccountId, debit: variance }, // Cash increases (gain)
              { accountId: varianceAccountId, credit: variance }, // Variance income
            ]
          : [
              { accountId: varianceAccountId, debit: variance }, // Variance expense
              { accountId: cashAccountId, credit: variance }, // Cash decreases (loss)
            ],
      });
    }

    return this.prisma.posSession.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById,
        expectedCash,
        countedCash: dto.countedCash ?? null,
        cashVariance,
      },
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

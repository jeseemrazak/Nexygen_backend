import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppModulesService } from '../app-modules/app-modules.service';

const MODULE_KEY = 'loyalty-rewards';

@Injectable()
export class LoyaltyService {
  constructor(
    private prisma: PrismaService,
    private appModules: AppModulesService,
  ) {}

  // Null when the module isn't installed — callers (POS checkout) treat that as "no loyalty
  // program active" and skip earning/redemption entirely, same convention as NotificationsService.
  async getConfig(): Promise<Record<string, any> | null> {
    return this.appModules.getActiveConfig(MODULE_KEY);
  }

  // Pure — no DB access — so pos-sales.service.ts can call it inside its own transaction without
  // an extra round trip. Returns 0 (nothing recorded) whenever earning isn't actually enabled.
  computePointsEarned(config: Record<string, any> | null, amount: number): number {
    if (!config || config.enableEarning === false || amount <= 0) return 0;
    const perUnit = Number(config.pointsPerCurrencyUnit) > 0 ? Number(config.pointsPerCurrencyUnit) : 1;
    const unitAmount = Number(config.amountPerPoint) > 0 ? Number(config.amountPerPoint) : 10;
    return Math.floor((amount / unitAmount) * perUnit);
  }

  // Balance is always the sum of the ledger — never a stored counter (see schema comment on
  // LoyaltyTransaction) — so it self-corrects if a transaction is ever added/removed by hand.
  async getBalance(customerId: number): Promise<number> {
    const agg = await this.prisma.loyaltyTransaction.aggregate({ where: { customerId }, _sum: { points: true } });
    return agg._sum.points ?? 0;
  }

  async getHistory(customerId: number) {
    return this.prisma.loyaltyTransaction.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async getCustomerSummary(customerId: number) {
    const [balance, history] = await Promise.all([this.getBalance(customerId), this.getHistory(customerId)]);
    return { balance, history };
  }

  async redeem(customerId: number, points: number): Promise<{ discountAmount: number; newBalance: number }> {
    const config = await this.getConfig();
    if (!config) throw new BadRequestException('Loyalty & Rewards module is not installed');
    if (config.enableRedemption === false) throw new BadRequestException('Point redemption is disabled');

    const balance = await this.getBalance(customerId);
    if (points > balance) throw new BadRequestException(`Insufficient points balance (${balance} available)`);

    const rate = Number(config.redemptionRate) > 0 ? Number(config.redemptionRate) : 0.1;
    const discountAmount = points * rate;

    await this.prisma.loyaltyTransaction.create({ data: { customerId, points: -points, type: 'REDEEM' } });
    return { discountAmount, newBalance: balance - points };
  }
}

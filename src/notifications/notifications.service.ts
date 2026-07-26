import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppModulesService } from '../app-modules/app-modules.service';

const MODULE_KEY = 'whatsapp-notifications';
const DEFAULT_LOW_STOCK_THRESHOLD = 20;

// Every call here is fire-and-forget from the caller's perspective — a failed/misconfigured
// notification must never fail the sales order confirm, delivery, or checkout it's attached to.
// Callers should invoke these without awaiting (or await + swallow), never let them block or
// throw into the main request.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private appModules: AppModulesService,
  ) {}

  private async send(to: string, body: string, config: Record<string, any>): Promise<void> {
    if (!to || !config.accountSid || !config.authToken) return;
    const useWhatsapp = config.channel !== 'sms';
    const from = useWhatsapp ? config.whatsappFromNumber : config.smsFromNumber;
    if (!from) return;

    const params = new URLSearchParams({
      To: useWhatsapp ? `whatsapp:${to}` : to,
      From: useWhatsapp ? `whatsapp:${from}` : from,
      Body: body,
    });

    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64'),
        },
        body: params,
      });
      if (!res.ok) {
        this.logger.warn(`Twilio send failed (${res.status}): ${await res.text()}`);
      }
    } catch (err) {
      this.logger.warn(`Twilio send threw: ${(err as Error).message}`);
    }
  }

  async notifyOrderConfirmed(order: { id: number; customer?: { phone?: string | null; name?: string | null } | null; totalAmount: number }): Promise<void> {
    const config = await this.appModules.getActiveConfig(MODULE_KEY);
    if (!config || !config.notifyOnOrderConfirmed) return;
    const phone = order.customer?.phone;
    if (!phone) return;
    await this.send(phone, `Hi ${order.customer?.name || 'there'}, your order #${order.id} has been confirmed. Total: ${order.totalAmount.toFixed(2)}. Thank you!`, config);
  }

  async notifyDelivered(delivery: { id: number; salesOrderId: number }): Promise<void> {
    const config = await this.appModules.getActiveConfig(MODULE_KEY);
    if (!config || !config.notifyOnDelivery) return;

    const order = await this.prisma.salesOrder.findUnique({
      where: { id: delivery.salesOrderId },
      include: { customer: true },
    });
    const phone = order?.customer?.phone;
    if (!phone) return;
    await this.send(phone, `Hi ${order?.customer?.name || 'there'}, your order #${order?.id} has been delivered. Thank you for your business!`, config);
  }

  // Fired after a stock-decreasing operation (POS sale / delivery). `quantityBefore` /
  // `quantityAfter` are the product's total quantity across all warehouses, before and after this
  // specific decrement — only notifies on the crossing (before >= threshold, after < threshold),
  // not on every sale that happens to land under the threshold, to avoid repeat pages for the
  // same low-stock product.
  async notifyLowStockIfCrossed(product: { id: number; name: string }, quantityBefore: number, quantityAfter: number): Promise<void> {
    const config = await this.appModules.getActiveConfig(MODULE_KEY);
    if (!config || !config.notifyOnLowStock || !config.lowStockAdminPhone) return;

    const threshold = Number(config.lowStockThreshold) > 0 ? Number(config.lowStockThreshold) : DEFAULT_LOW_STOCK_THRESHOLD;
    if (quantityBefore >= threshold && quantityAfter < threshold) {
      await this.send(config.lowStockAdminPhone, `Low stock alert: "${product.name}" has dropped to ${quantityAfter} units (threshold: ${threshold}).`, config);
    }
  }
}

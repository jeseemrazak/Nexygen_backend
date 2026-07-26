import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MODULE_CATALOG, findCatalogEntry } from './module-catalog';

@Injectable()
export class AppModulesService {
  constructor(private prisma: PrismaService) {}

  // Every catalog entry, merged with its install state — this is what the App Store page renders.
  async findAll() {
    const installed = await this.prisma.installedModule.findMany();
    const byKey = new Map(installed.map((m) => [m.key, m]));
    return MODULE_CATALOG.map((entry) => {
      const row = byKey.get(entry.key);
      return {
        ...entry,
        isActive: row?.isActive ?? false,
        installedAt: row?.installedAt ?? null,
        config: row?.config ?? {},
      };
    });
  }

  async findOne(key: string) {
    const entry = findCatalogEntry(key);
    if (!entry) throw new NotFoundException(`Module '${key}' not found`);
    const row = await this.prisma.installedModule.findUnique({ where: { key } });
    return { ...entry, isActive: row?.isActive ?? false, installedAt: row?.installedAt ?? null, config: row?.config ?? {} };
  }

  async install(key: string) {
    if (!findCatalogEntry(key)) throw new NotFoundException(`Module '${key}' not found`);
    return this.prisma.installedModule.upsert({
      where: { key },
      create: { key, isActive: true, installedAt: new Date() },
      update: { isActive: true, installedAt: new Date() },
    });
  }

  async uninstall(key: string) {
    const row = await this.prisma.installedModule.findUnique({ where: { key } });
    if (!row) throw new BadRequestException(`Module '${key}' is not installed`);
    return this.prisma.installedModule.update({ where: { key }, data: { isActive: false } });
  }

  async updateConfig(key: string, config: Record<string, unknown>) {
    const row = await this.prisma.installedModule.findUnique({ where: { key } });
    if (!row || !row.isActive) throw new BadRequestException(`Module '${key}' must be installed before it can be configured`);
    return this.prisma.installedModule.update({ where: { key }, data: { config: config as object } });
  }

  // Internal helper for other services (e.g. NotificationsService) — returns the config only
  // when the module is actually installed, so callers never need their own isActive check.
  async getActiveConfig(key: string): Promise<Record<string, any> | null> {
    const row = await this.prisma.installedModule.findUnique({ where: { key } });
    if (!row?.isActive) return null;
    return (row.config as Record<string, any>) ?? {};
  }
}

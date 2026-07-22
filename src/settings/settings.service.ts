import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  // Single-row settings table — created lazily with defaults on first read/write.
  async getCompanySettings() {
    const existing = await this.prisma.companySettings.findFirst();
    if (existing) return existing;
    return this.prisma.companySettings.create({ data: {} });
  }

  async updateCompanySettings(dto: UpdateCompanySettingsDto) {
    const settings = await this.getCompanySettings();
    return this.prisma.companySettings.update({ where: { id: settings.id }, data: dto as any });
  }

  async updateLogo(logoUrl: string | null) {
    const settings = await this.getCompanySettings();
    return this.prisma.companySettings.update({ where: { id: settings.id }, data: { logoUrl } });
  }
}

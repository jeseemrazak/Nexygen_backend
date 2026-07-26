import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  // Open to any authenticated role — same as the existing /orders/dashboard/summary these
  // cards sit alongside.
  @Get('document-status')
  getDocumentStatusSummary(@Query() query: any) {
    return this.service.getDocumentStatusSummary(query);
  }
}

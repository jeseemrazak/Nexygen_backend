import { Controller, Get, Post, Query } from '@nestjs/common';
import { EosGratuityService } from './eos-gratuity.service';

@Controller('payroll/eos-gratuity')
export class EosGratuityController {
  constructor(private readonly service: EosGratuityService) {}

  @Get('report')
  report(@Query('asOf') asOf?: string) {
    return this.service.report(asOf);
  }

  @Get('preview-increments')
  previewIncrements(@Query('asOf') asOf?: string) {
    return this.service.previewIncrements(asOf);
  }

  @Post('post-accrual')
  postAccrual() {
    return this.service.postAccrual();
  }
}

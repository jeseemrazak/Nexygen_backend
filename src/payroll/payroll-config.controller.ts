import { Controller, Get, Put, Body } from '@nestjs/common';
import { PayrollConfigService } from './payroll-config.service';
import { UpdatePayrollConfigDto } from './dto/update-payroll-config.dto';

@Controller('payroll/config')
export class PayrollConfigController {
  constructor(private readonly service: PayrollConfigService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Put()
  update(@Body() dto: UpdatePayrollConfigDto) {
    return this.service.update(dto);
  }
}

import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { GenerateRunDto } from './dto/generate-run.dto';
import { UpdatePayslipInputsDto } from './dto/update-payslip-inputs.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly service: PayrollService) {}

  @Post('runs')
  generateRun(@Body() dto: GenerateRunDto) {
    return this.service.generateRun(dto);
  }

  @Get('runs')
  findAll() {
    return this.service.findAll();
  }

  @Get('runs/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Get('runs/:id/payslips')
  findPayslips(@Param('id') id: string) {
    return this.service.findPayslips(+id);
  }

  @Delete('runs/:id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }

  @Post('runs/:id/process')
  process(@Param('id') id: string) {
    return this.service.process(+id);
  }

  @Post('runs/:id/mark-paid')
  markPaid(@Param('id') id: string, @Body() dto: MarkPaidDto) {
    return this.service.markPaid(+id, dto);
  }

  @Put('payslips/:id/manual-inputs')
  updatePayslipInputs(@Param('id') id: string, @Body() dto: UpdatePayslipInputsDto) {
    return this.service.updatePayslipInputs(+id, dto);
  }

  @Delete('payslips/:id')
  removePayslip(@Param('id') id: string) {
    return this.service.removePayslip(+id);
  }
}

import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { EmployeeLoansService } from './employee-loans.service';
import { IssueLoanDto } from './dto/issue-loan.dto';
import { RepayLoanDto } from './dto/repay-loan.dto';

@Controller('employee-loans')
export class EmployeeLoansController {
  constructor(private readonly service: EmployeeLoansService) {}

  @Post()
  issue(@Body() dto: IssueLoanDto) {
    return this.service.issue(dto);
  }

  @Get()
  findAll(@Query('employeeId') employeeId?: string, @Query('status') status?: string) {
    return this.service.findAll(employeeId ? +employeeId : undefined, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Get(':id/repayments')
  findRepayments(@Param('id') id: string) {
    return this.service.findRepayments(+id);
  }

  @Post(':id/manual-repayment')
  manualRepayment(@Param('id') id: string, @Body() dto: RepayLoanDto) {
    return this.service.manualRepayment(+id, dto);
  }
}

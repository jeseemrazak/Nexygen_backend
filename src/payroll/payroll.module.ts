import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { PayrollConfigService } from './payroll-config.service';
import { PayrollConfigController } from './payroll-config.controller';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollPostingService } from './payroll-posting.service';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { EmployeeLoansService } from './employee-loans.service';
import { EmployeeLoansController } from './employee-loans.controller';
import { EosGratuityService } from './eos-gratuity.service';
import { EosGratuityController } from './eos-gratuity.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [
    EmployeesController,
    PayrollConfigController,
    PayrollController,
    EmployeeLoansController,
    EosGratuityController,
  ],
  providers: [
    EmployeesService,
    PayrollConfigService,
    PayrollCalculationService,
    PayrollPostingService,
    PayrollService,
    EmployeeLoansService,
    EosGratuityService,
    PrismaService,
  ],
})
export class PayrollModule {}

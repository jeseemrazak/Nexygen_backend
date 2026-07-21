import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdatePayrollConfigDto {
  @IsNumber() @Min(0) @IsOptional() grsiaEmployeePercent?: number;
  @IsNumber() @Min(0) @IsOptional() grsiaEmployerPercent?: number;
  @IsNumber() @Min(1) @IsOptional() workingDaysPerMonth?: number;
  @IsNumber() @Min(1) @IsOptional() workingHoursPerDay?: number;
  @IsNumber() @Min(1) @IsOptional() overtimeMultiplier?: number;
  @IsNumber() @Min(1) @IsOptional() nightOvertimeMultiplier?: number;
  @IsNumber() @Min(0) @IsOptional() eosWeeksPerYear?: number;
}

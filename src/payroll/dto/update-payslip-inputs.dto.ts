import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdatePayslipInputsDto {
  @IsNumber() @Min(0) @IsOptional() overtimeHours?: number;
  @IsNumber() @Min(0) @IsOptional() nightOvertimeHours?: number;
  @IsNumber() @Min(0) @IsOptional() unpaidLeaveDays?: number;
  @IsNumber() @Min(0) @IsOptional() otherDeductions?: number;
}

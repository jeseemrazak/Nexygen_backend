import { IsInt, IsNumber, Min, IsOptional } from 'class-validator';

export class IssueLoanDto {
  @IsInt()
  employeeId: number;

  @IsNumber()
  @Min(0.01)
  principalAmount: number;

  @IsNumber()
  @Min(0.01)
  monthlyDeduction: number;

  @IsInt()
  @IsOptional()
  journalId?: number;
}

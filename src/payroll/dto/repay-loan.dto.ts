import { IsNumber, Min, IsInt, IsOptional } from 'class-validator';

export class RepayLoanDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsInt()
  @IsOptional()
  journalId?: number;
}

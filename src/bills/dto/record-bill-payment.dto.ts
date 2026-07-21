import { IsNumber, IsString, IsInt, IsOptional, Min } from 'class-validator';

export class RecordBillPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  method?: string;

  @IsInt()
  @IsOptional()
  journalId?: number;
}

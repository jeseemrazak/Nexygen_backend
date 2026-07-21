import { IsIn, IsInt, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreatePaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(['CASH_BANK', 'ACCOUNT_RECEIVABLE'])
  @IsOptional()
  type?: 'CASH_BANK' | 'ACCOUNT_RECEIVABLE';

  @IsInt()
  @IsOptional()
  journalId?: number;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

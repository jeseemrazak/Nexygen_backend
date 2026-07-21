import { IsIn, IsInt, IsOptional, IsString, IsNotEmpty, IsBoolean } from 'class-validator';

export class UpdatePaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsIn(['CASH_BANK', 'ACCOUNT_RECEIVABLE'])
  @IsOptional()
  type?: 'CASH_BANK' | 'ACCOUNT_RECEIVABLE';

  @IsInt()
  @IsOptional()
  journalId?: number;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

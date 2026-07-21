import { IsIn, IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class UpdateAccountDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'])
  @IsOptional()
  type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

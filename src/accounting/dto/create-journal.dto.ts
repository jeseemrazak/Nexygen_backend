import { IsIn, IsInt, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateJournalDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsIn(['SALE', 'PURCHASE', 'CASH', 'BANK', 'MISC'])
  type: 'SALE' | 'PURCHASE' | 'CASH' | 'BANK' | 'MISC';

  @IsString()
  @IsNotEmpty()
  sequencePrefix: string;

  @IsInt()
  @IsOptional()
  defaultDebitAccountId?: number;

  @IsInt()
  @IsOptional()
  defaultCreditAccountId?: number;
}

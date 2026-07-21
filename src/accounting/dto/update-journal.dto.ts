import { IsIn, IsInt, IsOptional, IsString, IsNotEmpty, IsBoolean } from 'class-validator';

export class UpdateJournalDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsInt()
  @IsOptional()
  defaultDebitAccountId?: number;

  @IsInt()
  @IsOptional()
  defaultCreditAccountId?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

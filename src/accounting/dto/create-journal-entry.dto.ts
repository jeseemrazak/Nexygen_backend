import { IsInt, IsArray, ValidateNested, IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

class JournalLineDto {
  @IsInt()
  accountId: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  debit?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  credit?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  costCenterId?: number;
}

export class CreateJournalEntryDto {
  @IsString()
  @IsOptional()
  memo?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}

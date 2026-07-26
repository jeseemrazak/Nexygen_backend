import { IsInt, IsString, IsOptional, IsDateString, Min } from 'class-validator';

export class CreateInventoryDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string | null;
}

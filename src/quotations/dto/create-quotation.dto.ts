import { IsInt, IsArray, ValidateNested, IsNumber, IsString, IsOptional, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

class QuotationItemDto {
  @IsInt()
  productId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateQuotationDto {
  @IsInt()
  @IsOptional()
  userId?: number;

  @IsInt()
  warehouseId: number;

  @IsString()
  @IsOptional()
  clientName?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items: QuotationItemDto[];
}

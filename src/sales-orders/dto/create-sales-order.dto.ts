import { IsInt, IsArray, ValidateNested, IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class SalesOrderItemDto {
  @IsInt()
  productId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateSalesOrderDto {
  @IsInt()
  warehouseId: number;

  @IsString()
  @IsOptional()
  clientName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items: SalesOrderItemDto[];
}

import { IsInt, IsArray, ValidateNested, IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class PurchaseOrderItemDto {
  @IsInt()
  productId: number;

  @IsInt()
  @Min(1)
  quantityOrdered: number;

  @IsNumber()
  @Min(0)
  unitCost: number;
}

export class CreatePurchaseOrderDto {
  @IsInt()
  supplierId: number;

  @IsInt()
  warehouseId: number;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsInt()
  @IsOptional()
  taxId?: number;

  @IsInt()
  @IsOptional()
  costCenterId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}

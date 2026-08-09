import { IsInt, IsArray, ValidateNested, IsNumber, IsString, IsOptional, IsIn, Min } from 'class-validator';
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

  // Original unit price before the line discount below — omit if there's no discount on this line.
  @IsNumber()
  @Min(0)
  @IsOptional()
  listPrice?: number;

  @IsIn(['PERCENT', 'AMOUNT'])
  @IsOptional()
  lineDiscountType?: 'PERCENT' | 'AMOUNT';

  @IsNumber()
  @Min(0)
  @IsOptional()
  lineDiscountValue?: number;
}

export class CreateSalesOrderDto {
  @IsInt()
  warehouseId: number;

  @IsString()
  @IsOptional()
  clientName?: string;

  @IsInt()
  @IsOptional()
  customerId?: number;

  @IsString()
  @IsOptional()
  customerReference?: string;

  @IsString()
  @IsOptional()
  termsAndConditions?: string;

  // Global (whole-document) discount — applies to the subtotal after all line discounts.
  @IsIn(['PERCENT', 'AMOUNT'])
  @IsOptional()
  discountType?: 'PERCENT' | 'AMOUNT';

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountValue?: number;

  @IsInt()
  @IsOptional()
  taxId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items: SalesOrderItemDto[];
}

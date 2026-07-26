import { IsString, IsNumber, IsNotEmpty, Min, IsOptional, IsInt, IsIn, IsBoolean } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcodePcs?: string;

  @IsString()
  @IsOptional()
  barcodeBox?: string;

  // A Service skips warehouse/stock/batch requirements on the Sales side (Delivery, POS).
  @IsIn(['GOODS', 'SERVICE'])
  @IsOptional()
  type?: 'GOODS' | 'SERVICE';

  @IsBoolean()
  @IsOptional()
  posActive?: boolean;

  @IsInt()
  @IsOptional()
  categoryId?: number;

  @IsInt()
  @IsOptional()
  posCategoryId?: number;

  @IsInt()
  @IsOptional()
  unitId?: number;
}
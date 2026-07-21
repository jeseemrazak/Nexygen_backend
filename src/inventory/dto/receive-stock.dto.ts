import { IsInt, IsString, IsOptional, Min } from 'class-validator';

export class ReceiveStockDto {
  @IsInt()
  warehouseId: number;

  @IsInt()
  productId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  batchNumber: string;

  @IsString()
  @IsOptional()
  expiryDate?: string;
}
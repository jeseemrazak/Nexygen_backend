import { IsInt, IsArray, ValidateNested, IsString, IsOptional, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

class ReceiptItemDto {
  @IsInt()
  purchaseOrderItemId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  batchNumber: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;
}

export class CreateReceiptDto {
  @IsInt()
  purchaseOrderId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  items: ReceiptItemDto[];
}

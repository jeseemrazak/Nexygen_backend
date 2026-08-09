import { IsInt, IsArray, ValidateNested, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class ReceiptReturnItemDto {
  @IsInt()
  receiptItemId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class ReturnReceiptDto {
  @IsString()
  @IsOptional()
  reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptReturnItemDto)
  items: ReceiptReturnItemDto[];
}

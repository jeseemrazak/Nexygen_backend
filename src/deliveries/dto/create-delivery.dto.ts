import { IsInt, IsArray, ValidateNested, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

class DeliveryItemDto {
  @IsInt()
  salesOrderItemId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  batchNumber: string;
}

export class CreateDeliveryDto {
  @IsInt()
  salesOrderId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryItemDto)
  items: DeliveryItemDto[];
}

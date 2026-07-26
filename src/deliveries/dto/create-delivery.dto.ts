import { IsInt, IsArray, ValidateNested, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class DeliveryItemDto {
  @IsInt()
  salesOrderItemId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  // Omitted for a Service-type line — services have no batch/warehouse stock to pick from.
  @IsString()
  @IsOptional()
  batchNumber?: string;
}

export class CreateDeliveryDto {
  @IsInt()
  salesOrderId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryItemDto)
  items: DeliveryItemDto[];
}

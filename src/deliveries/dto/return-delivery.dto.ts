import { IsInt, IsArray, ValidateNested, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class DeliveryReturnItemDto {
  @IsInt()
  deliveryItemId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class ReturnDeliveryDto {
  @IsString()
  @IsOptional()
  reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryReturnItemDto)
  items: DeliveryReturnItemDto[];
}

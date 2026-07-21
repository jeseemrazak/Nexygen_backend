import { IsInt, IsArray, ValidateNested, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class PosSaleItemDto {
  @IsInt()
  productId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  batchNumber: string;
}

export class CreatePosSaleDto {
  @IsInt()
  sessionId: number;

  @IsInt()
  paymentMethodId: number;

  @IsInt()
  @IsOptional()
  servedById?: number;

  @IsString()
  @IsOptional()
  clientName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosSaleItemDto)
  items: PosSaleItemDto[];
}

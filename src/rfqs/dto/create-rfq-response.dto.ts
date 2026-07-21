import { IsInt, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

class RfqResponseItemDto {
  @IsInt()
  productId: number;

  @IsNumber()
  @Min(0)
  unitCost: number;
}

export class CreateRfqResponseDto {
  @IsInt()
  supplierId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RfqResponseItemDto)
  items: RfqResponseItemDto[];
}

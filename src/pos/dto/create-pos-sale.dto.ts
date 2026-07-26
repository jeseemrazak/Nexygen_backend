import { IsInt, IsArray, ValidateNested, IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

class PosSaleItemDto {
  @IsInt()
  productId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  // Omitted for a Service-type item — services have no batch/warehouse stock to pick from.
  @IsString()
  @IsOptional()
  batchNumber?: string;
}

export class CreatePosSaleDto {
  @IsInt()
  sessionId: number;

  @IsInt()
  paymentMethodId: number;

  // Verified via PosStaffService.resolveStaffToken — never trust a raw id from the client for
  // attribution, since anyone could otherwise claim to be any staff member on any sale.
  @IsString()
  @IsOptional()
  servedByToken?: string;

  @IsString()
  @IsOptional()
  clientName?: string;

  @IsInt()
  @IsOptional()
  customerId?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosSaleItemDto)
  items: PosSaleItemDto[];
}

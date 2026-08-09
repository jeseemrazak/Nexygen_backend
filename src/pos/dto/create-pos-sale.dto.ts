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

export class PosSalePaymentDto {
  @IsInt()
  paymentMethodId: number;

  @IsNumber()
  @Min(0.01)
  amount: number;
}

export class CreatePosSaleDto {
  @IsInt()
  sessionId: number;

  // Required unless `payments` (split-tender) is supplied instead.
  @IsInt()
  @IsOptional()
  paymentMethodId?: number;

  // Split-tender: two or more payment methods covering the total between them (e.g. part
  // cash, part card). When omitted, the sale is a single payment on paymentMethodId — that
  // path's behavior and GL posting is unchanged from before this field existed.
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PosSalePaymentDto)
  payments?: PosSalePaymentDto[];

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

  @IsInt()
  @IsOptional()
  taxId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosSaleItemDto)
  items: PosSaleItemDto[];
}

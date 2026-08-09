import { IsInt, IsArray, IsOptional, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class InvoiceItemDto {
  @IsInt()
  salesOrderItemId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateInvoiceDto {
  @IsInt()
  salesOrderId: number;

  @IsInt()
  @IsOptional()
  taxId?: number;

  @IsInt()
  @IsOptional()
  costCenterId?: number;

  @IsInt()
  @IsOptional()
  paymentTermId?: number;

  @IsInt()
  @IsOptional()
  currencyId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];
}

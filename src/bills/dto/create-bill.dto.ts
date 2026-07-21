import { IsInt, IsArray, ValidateNested, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class BillItemDto {
  @IsInt()
  purchaseOrderItemId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  // Optional override of the PO's ordered unit cost, for real price variance vs. the actual supplier invoice.
  @IsNumber()
  @IsOptional()
  unitCost?: number;
}

export class CreateBillDto {
  @IsInt()
  purchaseOrderId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillItemDto)
  items: BillItemDto[];
}

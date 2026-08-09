import { IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AllocationDto {
  @IsIn(['SALES_INVOICE', 'PURCHASE_INVOICE', 'POS_SALE'])
  sourceType: 'SALES_INVOICE' | 'PURCHASE_INVOICE' | 'POS_SALE';

  @IsInt()
  sourceId: number;

  @IsNumber()
  @Min(0.01)
  amountAllocated: number;
}

export class CreatePartyPaymentDto {
  @IsIn(['CUSTOMER', 'SUPPLIER'])
  partyType: 'CUSTOMER' | 'SUPPLIER';

  @IsString()
  @IsNotEmpty()
  partyName: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  method?: string;

  @IsInt()
  @IsOptional()
  journalId?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations: AllocationDto[];
}

import { IsInt, IsString, IsNumber, IsOptional } from 'class-validator';

export class OpenSessionDto {
  @IsInt()
  warehouseId: number;

  // Verified via PosStaffService.resolveStaffToken — see create-pos-sale.dto.ts for why.
  @IsString()
  @IsOptional()
  openedByToken?: string;

  // Starting float in the cash drawer — optional, only meaningful for till reconciliation at close.
  @IsNumber()
  @IsOptional()
  openingCash?: number;
}

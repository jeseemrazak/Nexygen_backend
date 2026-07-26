import { IsString, IsOptional } from 'class-validator';

export class CancelPosSaleDto {
  @IsString()
  @IsOptional()
  reason?: string;

  // Verified via PosStaffService.resolveStaffToken — see create-pos-sale.dto.ts for why.
  @IsString()
  @IsOptional()
  cancelledByToken?: string;
}

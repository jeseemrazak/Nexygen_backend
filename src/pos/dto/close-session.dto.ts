import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CloseSessionDto {
  // Verified via PosStaffService.resolveStaffToken — see create-pos-sale.dto.ts for why.
  @IsString()
  @IsOptional()
  closedByToken?: string;

  // Physically counted cash in the drawer at close — server computes expectedCash/cashVariance
  // from this, never the other way around.
  @IsNumber()
  @IsOptional()
  countedCash?: number;
}

import { IsString, IsOptional, IsInt } from 'class-validator';

export class CancelPosSaleDto {
  @IsString()
  @IsOptional()
  reason?: string;

  @IsInt()
  @IsOptional()
  cancelledById?: number;
}

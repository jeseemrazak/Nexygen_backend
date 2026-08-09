import { IsString, IsInt, IsOptional, IsBoolean, IsNotEmpty, Min } from 'class-validator';

export class UpdatePaymentTermDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  days?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

import { IsString, IsNumber, IsOptional, IsBoolean, IsNotEmpty, Min, Max } from 'class-validator';

export class UpdateTaxDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  rate?: number;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

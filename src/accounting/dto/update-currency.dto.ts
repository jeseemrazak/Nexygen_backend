import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

export class UpdateCurrencyDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  symbol?: string;

  @IsNumber()
  @Min(0.000001)
  @IsOptional()
  exchangeRateToBase?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

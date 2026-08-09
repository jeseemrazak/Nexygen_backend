import { IsString, IsNumber, IsOptional, IsBoolean, IsNotEmpty, Min, Max } from 'class-validator';

export class CreateTaxDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  rate: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

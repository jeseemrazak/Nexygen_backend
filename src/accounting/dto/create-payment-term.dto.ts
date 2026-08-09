import { IsString, IsInt, IsOptional, IsBoolean, IsNotEmpty, Min } from 'class-validator';

export class CreatePaymentTermDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(0)
  days: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsNumber, IsInt, Min, IsDateString } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  isQatari?: boolean;

  @IsString()
  @IsOptional()
  qidNumber?: string;

  @IsDateString()
  @IsOptional()
  qidExpiryDate?: string;

  @IsString()
  @IsOptional()
  passportNumber?: string;

  @IsDateString()
  @IsOptional()
  passportExpiryDate?: string;

  @IsDateString()
  @IsOptional()
  visaExpiryDate?: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  iban?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  basicSalary?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  housingAllowance?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  transportationAllowance?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  telephoneAllowance?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  otherAllowance?: number;

  @IsDateString()
  @IsOptional()
  hireDate?: string;

  @IsInt()
  @IsOptional()
  userId?: number;
}

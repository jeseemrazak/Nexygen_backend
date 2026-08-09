import { IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateCostCenterDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

import { IsString, IsNotEmpty, IsOptional, IsBoolean, Length } from 'class-validator';

export class UpdatePosStaffDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @Length(4, 6)
  @IsOptional()
  pin?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

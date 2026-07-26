import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  plateNumber!: string;

  @IsString() @IsOptional() make?: string;
  @IsString() @IsOptional() model?: string;
  @IsInt() @IsOptional() year?: number;
  @IsString() @IsOptional() color?: string;
  @IsString() @IsOptional() vin?: string;
  @IsInt() @IsOptional() customerId?: number;
  @IsString() @IsOptional() notes?: string;
}

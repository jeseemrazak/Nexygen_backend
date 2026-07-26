import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateJobOrderDto {
  @IsInt()
  vehicleId!: number;

  @IsInt() @IsOptional() customerId?: number;
  @IsInt() @IsOptional() technicianId?: number;

  @IsInt()
  warehouseId!: number;

  @IsString() @IsOptional() description?: string;
  @IsInt() @IsOptional() odometerReading?: number;
  @IsString() @IsOptional() notes?: string;
}

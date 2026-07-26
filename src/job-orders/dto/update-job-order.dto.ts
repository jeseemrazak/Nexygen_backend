import { IsString, IsOptional, IsInt } from 'class-validator';

// Header fields only — vehicleId/warehouseId/customerId are fixed at creation, same convention
// as a Sales Order's warehouse never changing after the fact.
export class UpdateJobOrderDto {
  @IsInt() @IsOptional() technicianId?: number;
  @IsString() @IsOptional() description?: string;
  @IsInt() @IsOptional() odometerReading?: number;
  @IsString() @IsOptional() notes?: string;
}

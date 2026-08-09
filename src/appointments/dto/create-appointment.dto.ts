import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn, IsDateString } from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsDateString()
  appointmentAt: string;

  @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
  @IsOptional()
  status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

  @IsString()
  @IsOptional()
  notes?: string;

  @IsInt()
  @IsOptional()
  customerId?: number;

  @IsInt()
  @IsOptional()
  leadId?: number;

  @IsInt()
  @IsOptional()
  staffId?: number;
}

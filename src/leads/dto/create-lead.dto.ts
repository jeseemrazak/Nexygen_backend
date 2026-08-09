import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsIn(['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'])
  @IsOptional()
  stage?: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'WON' | 'LOST';

  @IsString()
  @IsOptional()
  notes?: string;

  @IsInt()
  @IsOptional()
  assignedToId?: number;
}

import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn, IsDateString } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  @IsOptional()
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';

  @IsIn(['TODO', 'IN_PROGRESS', 'DONE'])
  @IsOptional()
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';

  @IsInt()
  @IsOptional()
  assignedToId?: number;

  @IsInt()
  @IsOptional()
  createdById?: number;
}

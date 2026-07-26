import { IsIn } from 'class-validator';

export class UpdateJobOrderStatusDto {
  @IsIn(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status!: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

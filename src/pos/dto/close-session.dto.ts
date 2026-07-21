import { IsInt, IsOptional } from 'class-validator';

export class CloseSessionDto {
  @IsInt()
  @IsOptional()
  closedById?: number;
}

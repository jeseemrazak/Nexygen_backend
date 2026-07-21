import { IsInt, IsOptional } from 'class-validator';

export class OpenSessionDto {
  @IsInt()
  warehouseId: number;

  @IsInt()
  @IsOptional()
  openedById?: number;
}

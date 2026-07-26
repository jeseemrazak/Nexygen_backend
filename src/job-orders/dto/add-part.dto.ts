import { IsString, IsInt, Min } from 'class-validator';

export class AddJobOrderPartDto {
  @IsInt()
  productId!: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  batchNumber!: string;
}

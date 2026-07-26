import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class AddJobOrderLaborDto {
  @IsString()
  description!: string;

  @IsNumber() @IsOptional() hours?: number;
  @IsNumber() @IsOptional() rate?: number;

  @IsNumber()
  @Min(0)
  amount!: number;
}

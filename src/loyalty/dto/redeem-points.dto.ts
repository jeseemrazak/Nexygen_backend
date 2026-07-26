import { IsInt, Min } from 'class-validator';

export class RedeemPointsDto {
  @IsInt()
  customerId!: number;

  @IsInt()
  @Min(1)
  points!: number;
}

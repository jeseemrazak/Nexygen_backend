import { IsDateString } from 'class-validator';

export class GenerateRunDto {
  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;
}

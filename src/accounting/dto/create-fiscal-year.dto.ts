import { IsString, IsDateString, IsNotEmpty } from 'class-validator';

export class CreateFiscalYearDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

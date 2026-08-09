import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCostCenterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}

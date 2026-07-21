import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyPinDto {
  @IsString()
  @IsNotEmpty()
  pin: string;
}

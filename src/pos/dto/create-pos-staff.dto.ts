import { IsString, IsNotEmpty, Length } from 'class-validator';

export class CreatePosStaffDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Length(4, 6)
  pin: string;
}

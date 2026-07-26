import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';

export class UpdateMerchandiserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  // Only present when the admin is resetting the merchandiser's password.
  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}

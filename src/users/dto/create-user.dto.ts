import { IsString, IsEmail, MinLength, IsEnum, IsOptional } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsString()
  @MinLength(2)
  name: string;

  // This strictly limits the role to the enums we defined in Prisma
  @IsEnum(Role, { message: 'Valid roles: ADMIN, COORDINATOR, WAREHOUSE, MERCHANDISER' })
  @IsOptional()
  role?: Role;
}
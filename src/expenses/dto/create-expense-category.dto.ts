import { IsInt, IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  accountId: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

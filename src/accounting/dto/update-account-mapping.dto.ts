import { IsInt } from 'class-validator';

export class UpdateAccountMappingDto {
  @IsInt()
  accountId: number;
}

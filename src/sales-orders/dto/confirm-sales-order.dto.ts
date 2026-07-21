import { IsInt } from 'class-validator';

export class ConfirmSalesOrderDto {
  @IsInt()
  userId: number;
}

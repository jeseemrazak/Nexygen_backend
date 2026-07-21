import { IsInt, IsOptional } from 'class-validator';

export class MarkPaidDto {
  @IsInt()
  @IsOptional()
  journalId?: number;
}

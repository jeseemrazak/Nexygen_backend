import { IsOptional, IsString } from 'class-validator';

export class VoidJournalEntryDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

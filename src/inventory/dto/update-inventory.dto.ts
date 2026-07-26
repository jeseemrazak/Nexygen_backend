import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString } from 'class-validator';
import { CreateInventoryDto } from './create-inventory.dto';

export class UpdateInventoryDto extends PartialType(CreateInventoryDto) {
  // Optional note for the audit trail / journal memo when this update changes quantity.
  @IsString()
  @IsOptional()
  reason?: string;
}

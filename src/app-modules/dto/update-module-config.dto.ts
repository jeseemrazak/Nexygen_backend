import { IsObject } from 'class-validator';

// Each module's config shape is defined by its own `configFields` catalog entry, not by a
// per-module DTO — the object is stored as-is in InstalledModule.config (Json).
export class UpdateModuleConfigDto {
  @IsObject()
  config!: Record<string, unknown>;
}

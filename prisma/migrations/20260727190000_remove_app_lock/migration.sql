-- App Lock feature removed — drop the PIN-gate columns added in 20260727170000.
ALTER TABLE "CompanySettings" DROP COLUMN IF EXISTS "appLockEnabled";
ALTER TABLE "CompanySettings" DROP COLUMN IF EXISTS "appLockPinHash";

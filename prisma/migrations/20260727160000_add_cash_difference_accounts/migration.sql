-- Add new enum values for cash difference accounts
ALTER TYPE "AccountMappingRole" ADD VALUE IF NOT EXISTS 'CASH_DIFFERENCE_GAIN';
ALTER TYPE "AccountMappingRole" ADD VALUE IF NOT EXISTS 'CASH_DIFFERENCE_LOSS';

-- Create the two new GL accounts (if they don't already exist)
INSERT INTO "Account" (code, name, type, "isActive", "createdAt", "updatedAt")
SELECT '5950', 'Cash Difference Gain', 'INCOME', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Account" WHERE code = '5950');

INSERT INTO "Account" (code, name, type, "isActive", "createdAt", "updatedAt")
SELECT '5960', 'Cash Difference Loss', 'EXPENSE', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Account" WHERE code = '5960');

-- Create the account mappings (if they don't already exist)
INSERT INTO "AccountMapping" ("role", "accountId", "updatedAt")
SELECT 'CASH_DIFFERENCE_GAIN', (SELECT id FROM "Account" WHERE code = '5950'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AccountMapping" WHERE role = 'CASH_DIFFERENCE_GAIN');

INSERT INTO "AccountMapping" ("role", "accountId", "updatedAt")
SELECT 'CASH_DIFFERENCE_LOSS', (SELECT id FROM "Account" WHERE code = '5960'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AccountMapping" WHERE role = 'CASH_DIFFERENCE_LOSS');

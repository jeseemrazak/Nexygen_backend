-- Employee.defaultWarehouseId — resolves which warehouse a Restaurant session opens
-- against once the employee PIN-logs-in, replacing the manual register picker.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "defaultWarehouseId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "Employee" ADD CONSTRAINT "Employee_defaultWarehouseId_fkey"
    FOREIGN KEY ("defaultWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Restaurant Ticket / Waitlist queue board
DO $$ BEGIN
  CREATE TYPE "RestaurantTicketStatus" AS ENUM ('WAITING', 'PAUSED', 'EXPIRED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "RestaurantTicket" (
  "id" SERIAL PRIMARY KEY,
  "ticketNumber" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "partySize" INTEGER,
  "durationMins" INTEGER NOT NULL,
  "status" "RestaurantTicketStatus" NOT NULL DEFAULT 'WAITING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE "RestaurantTicket" ADD CONSTRAINT "RestaurantTicket_ticketNumber_key" UNIQUE ("ticketNumber");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RestaurantTicket" ADD CONSTRAINT "RestaurantTicket_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CompanySettings: KOT printing + App Lock PIN
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "kotAutoPrint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "kotFooterText" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "appLockEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "appLockPinHash" TEXT;

ALTER TABLE "JournalLine" ADD COLUMN "warehouseId" INTEGER;

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

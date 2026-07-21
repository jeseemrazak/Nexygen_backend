-- This migration reconciles the recorded migration history with schema changes
-- that were previously applied directly to the database (e.g. via `prisma db push`)
-- rather than through a tracked migration. It is marked as already-applied via
-- `prisma migrate resolve --applied` and is NOT executed against the live database,
-- since the underlying tables/columns already exist there.

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "fromWarehouseId" INTEGER,
    "toWarehouseId" INTEGER,
    "quantity" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Inventory (batch/expiry tracking)
DROP INDEX "Inventory_productId_warehouseId_key";
ALTER TABLE "Inventory" ADD COLUMN "batchNumber" TEXT NOT NULL DEFAULT 'DEFAULT';
ALTER TABLE "Inventory" ADD COLUMN "expiryDate" TIMESTAMP(3);
CREATE UNIQUE INDEX "Inventory_productId_warehouseId_batchNumber_key" ON "Inventory"("productId", "warehouseId", "batchNumber");

-- AlterTable: Order (client name, proof of delivery)
ALTER TABLE "Order" ADD COLUMN "clientName" TEXT;
ALTER TABLE "Order" ADD COLUMN "proofOfDelivery" TEXT;

-- AlterTable: OrderItem (batch snapshot)
ALTER TABLE "OrderItem" ADD COLUMN "batchNumber" TEXT NOT NULL DEFAULT 'DEFAULT';
ALTER TABLE "OrderItem" ADD COLUMN "boxBarcode" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "expiryDate" TIMESTAMP(3);

-- AlterTable: Product (SKU/barcodes)
ALTER TABLE "Product" ADD COLUMN "sku" TEXT;
ALTER TABLE "Product" ADD COLUMN "barcodePcs" TEXT;
ALTER TABLE "Product" ADD COLUMN "barcodeBox" TEXT;
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE UNIQUE INDEX "Product_barcodePcs_key" ON "Product"("barcodePcs");
CREATE UNIQUE INDEX "Product_barcodeBox_key" ON "Product"("barcodeBox");

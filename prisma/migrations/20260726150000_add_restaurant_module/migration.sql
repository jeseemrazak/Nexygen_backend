-- AlterEnum
ALTER TYPE "AccountMappingRole" ADD VALUE 'TIPS_PAYABLE';

-- CreateEnum
CREATE TYPE "RestaurantOrderStatus" AS ENUM ('OPEN', 'SENT', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KitchenItemStatus" AS ENUM ('PENDING', 'FIRED', 'READY', 'SERVED');

-- CreateTable
CREATE TABLE "RestaurantFloor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantFloor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTable" (
    "id" SERIAL NOT NULL,
    "floorId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "shape" TEXT NOT NULL DEFAULT 'SQUARE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantOrder" (
    "id" SERIAL NOT NULL,
    "tableId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "status" "RestaurantOrderStatus" NOT NULL DEFAULT 'OPEN',
    "guestCount" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "splitGroupId" TEXT,
    "tipAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posSaleId" INTEGER,
    "openedById" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "RestaurantOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantOrderItem" (
    "id" SERIAL NOT NULL,
    "restaurantOrderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "course" INTEGER NOT NULL DEFAULT 1,
    "batchNumber" TEXT NOT NULL DEFAULT 'DEFAULT',
    "kitchenStatus" "KitchenItemStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "firedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantOrder_posSaleId_key" ON "RestaurantOrder"("posSaleId");

-- CreateIndex
CREATE INDEX "RestaurantFloor_warehouseId_idx" ON "RestaurantFloor"("warehouseId");

-- CreateIndex
CREATE INDEX "RestaurantTable_floorId_idx" ON "RestaurantTable"("floorId");

-- CreateIndex
CREATE INDEX "RestaurantOrder_tableId_idx" ON "RestaurantOrder"("tableId");

-- CreateIndex
CREATE INDEX "RestaurantOrder_sessionId_idx" ON "RestaurantOrder"("sessionId");

-- CreateIndex
CREATE INDEX "RestaurantOrder_openedById_idx" ON "RestaurantOrder"("openedById");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_restaurantOrderId_idx" ON "RestaurantOrderItem"("restaurantOrderId");

-- CreateIndex
CREATE INDEX "RestaurantOrderItem_productId_idx" ON "RestaurantOrderItem"("productId");

-- AddForeignKey
ALTER TABLE "RestaurantFloor" ADD CONSTRAINT "RestaurantFloor_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "RestaurantFloor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PosSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "PosStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderItem" ADD CONSTRAINT "RestaurantOrderItem_restaurantOrderId_fkey" FOREIGN KEY ("restaurantOrderId") REFERENCES "RestaurantOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderItem" ADD CONSTRAINT "RestaurantOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

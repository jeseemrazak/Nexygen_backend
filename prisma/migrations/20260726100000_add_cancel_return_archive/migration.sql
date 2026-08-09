-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "DeliveryReturn" (
    "id" SERIAL NOT NULL,
    "deliveryId" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryReturnItem" (
    "id" SERIAL NOT NULL,
    "deliveryReturnId" INTEGER NOT NULL,
    "deliveryItemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "DeliveryReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptReturn" (
    "id" SERIAL NOT NULL,
    "receiptId" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptReturnItem" (
    "id" SERIAL NOT NULL,
    "receiptReturnId" INTEGER NOT NULL,
    "receiptItemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ReceiptReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryReturn_deliveryId_idx" ON "DeliveryReturn"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryReturnItem_deliveryReturnId_idx" ON "DeliveryReturnItem"("deliveryReturnId");

-- CreateIndex
CREATE INDEX "DeliveryReturnItem_deliveryItemId_idx" ON "DeliveryReturnItem"("deliveryItemId");

-- CreateIndex
CREATE INDEX "ReceiptReturn_receiptId_idx" ON "ReceiptReturn"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptReturnItem_receiptReturnId_idx" ON "ReceiptReturnItem"("receiptReturnId");

-- CreateIndex
CREATE INDEX "ReceiptReturnItem_receiptItemId_idx" ON "ReceiptReturnItem"("receiptItemId");

-- AddForeignKey
ALTER TABLE "DeliveryReturn" ADD CONSTRAINT "DeliveryReturn_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReturnItem" ADD CONSTRAINT "DeliveryReturnItem_deliveryReturnId_fkey" FOREIGN KEY ("deliveryReturnId") REFERENCES "DeliveryReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReturnItem" ADD CONSTRAINT "DeliveryReturnItem_deliveryItemId_fkey" FOREIGN KEY ("deliveryItemId") REFERENCES "DeliveryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptReturn" ADD CONSTRAINT "ReceiptReturn_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptReturnItem" ADD CONSTRAINT "ReceiptReturnItem_receiptReturnId_fkey" FOREIGN KEY ("receiptReturnId") REFERENCES "ReceiptReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptReturnItem" ADD CONSTRAINT "ReceiptReturnItem_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "ReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

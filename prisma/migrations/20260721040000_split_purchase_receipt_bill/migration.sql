-- Purchase flow split: PurchaseOrder -> Receipt(s) -> Bill(s) -> Payment
-- Hand-authored (not `prisma migrate diff`) to preserve existing data:
--   - Legacy PurchaseOrder.invoiceNumber (billing) becomes a Bill, at full ordered qty/cost
--     (matches actual legacy behavior: the old receive() billed the whole PO the first time
--     anything was received).
--   - Legacy PurchaseOrderItem.quantityReceived > 0 becomes a Receipt with matching ReceiptItems
--     (batch/expiry copied over).
--   - PurchasePayment is bridged from purchaseOrderId to the new Bill.id (1:1, since only one
--     legacy "bill" existed per PO).

-- ===== 1. New tables =====

-- CreateTable
CREATE TABLE "Receipt" (
    "id" SERIAL NOT NULL,
    "receiptNumber" TEXT,
    "purchaseOrderId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptItem" (
    "id" SERIAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batchNumber" TEXT NOT NULL DEFAULT 'DEFAULT',
    "expiryDate" TIMESTAMP(3),
    "receiptId" INTEGER NOT NULL,
    "purchaseOrderItemId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,

    CONSTRAINT "ReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" SERIAL NOT NULL,
    "billNumber" TEXT,
    "purchaseOrderId" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillItem" (
    "id" SERIAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "billId" INTEGER NOT NULL,
    "purchaseOrderItemId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,

    CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");
CREATE UNIQUE INDEX "Bill_billNumber_key" ON "Bill"("billNumber");

-- ===== 2. New tracking column on PurchaseOrderItem =====

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "quantityBilled" INTEGER NOT NULL DEFAULT 0;

-- ===== 3. Data migration: legacy invoiceNumber -> Bill + BillItem =====

INSERT INTO "Bill" ("billNumber", "purchaseOrderId", "totalAmount", "paymentStatus", "amountPaid", "createdAt", "updatedAt")
SELECT "invoiceNumber", "id", "totalAmount", "paymentStatus", "amountPaid", "createdAt", "createdAt"
FROM "PurchaseOrder"
WHERE "invoiceNumber" IS NOT NULL;

INSERT INTO "BillItem" ("quantity", "unitCost", "billId", "purchaseOrderItemId", "productId")
SELECT poi."quantityOrdered", poi."unitCost", b."id", poi."id", poi."productId"
FROM "PurchaseOrderItem" poi
JOIN "Bill" b ON b."purchaseOrderId" = poi."purchaseOrderId";

UPDATE "PurchaseOrderItem" poi
SET "quantityBilled" = poi."quantityOrdered"
FROM "Bill" b
WHERE b."purchaseOrderId" = poi."purchaseOrderId";

-- ===== 4. Data migration: legacy quantityReceived -> Receipt + ReceiptItem =====

INSERT INTO "Receipt" ("purchaseOrderId", "createdAt")
SELECT DISTINCT poi."purchaseOrderId", po."createdAt"
FROM "PurchaseOrderItem" poi
JOIN "PurchaseOrder" po ON po."id" = poi."purchaseOrderId"
WHERE poi."quantityReceived" > 0;

INSERT INTO "ReceiptItem" ("quantity", "batchNumber", "expiryDate", "receiptId", "purchaseOrderItemId", "productId")
SELECT poi."quantityReceived", COALESCE(poi."batchNumber", 'DEFAULT'), poi."expiryDate", r."id", poi."id", poi."productId"
FROM "PurchaseOrderItem" poi
JOIN "Receipt" r ON r."purchaseOrderId" = poi."purchaseOrderId"
WHERE poi."quantityReceived" > 0;

-- ===== 5. Bridge PurchasePayment.purchaseOrderId -> billId =====

ALTER TABLE "PurchasePayment" ADD COLUMN "billId" INTEGER;

UPDATE "PurchasePayment" pp
SET "billId" = b."id"
FROM "Bill" b
WHERE b."purchaseOrderId" = pp."purchaseOrderId";

-- Every existing payment must resolve to a Bill (a payment could only be recorded against a PO
-- that already had an invoiceNumber under the old flow). Fail loudly if that invariant doesn't hold.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PurchasePayment" WHERE "billId" IS NULL) THEN
    RAISE EXCEPTION 'PurchasePayment rows exist with no resolvable Bill - aborting migration';
  END IF;
END $$;

ALTER TABLE "PurchasePayment" ALTER COLUMN "billId" SET NOT NULL;
ALTER TABLE "PurchasePayment" DROP CONSTRAINT "PurchasePayment_purchaseOrderId_fkey";
ALTER TABLE "PurchasePayment" DROP COLUMN "purchaseOrderId";
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== 6. Drop columns that moved to Receipt/Bill =====

DROP INDEX "PurchaseOrder_invoiceNumber_key";
ALTER TABLE "PurchaseOrder" DROP COLUMN "amountPaid",
DROP COLUMN "invoiceNumber",
DROP COLUMN "paymentStatus";

ALTER TABLE "PurchaseOrderItem" DROP COLUMN "batchNumber",
DROP COLUMN "expiryDate";

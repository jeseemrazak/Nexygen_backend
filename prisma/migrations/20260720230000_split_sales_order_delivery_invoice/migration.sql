-- Sales flow split: Order -> SalesOrder + Delivery + Invoice
-- Hand-authored (not Prisma-diff-generated) because this moves live data between
-- tables, which Prisma's diff tool cannot express. Reviewed carefully before applying.
--
-- Order of operations matters: Delivery rows are created from SalesOrder.status
-- WHILE that column still holds its OLD enum values (PENDING/APPROVED/SHIPPED/
-- DELIVERED/DRAFT/CANCELLED) -- the status column type is only converted to the
-- new SalesOrderStatus enum AFTER that data has been read out.

-- ============================================================
-- 1. New enum types
-- ============================================================
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'DONE', 'CANCELLED');
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- ============================================================
-- 2. Rename tables/columns in place (ids, sequences, existing rows, and existing
--    FK constraints from OrderItem/Payment/Quotation all survive a rename automatically)
-- ============================================================
ALTER TABLE "Order" RENAME TO "SalesOrder";
ALTER TABLE "OrderItem" RENAME TO "SalesOrderItem";
ALTER TABLE "SalesOrderItem" RENAME COLUMN "orderId" TO "salesOrderId";

-- ============================================================
-- 3. New tracking columns on SalesOrderItem for partial delivery/invoicing
-- ============================================================
ALTER TABLE "SalesOrderItem" ADD COLUMN "quantityDelivered" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrderItem" ADD COLUMN "quantityInvoiced" INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- 4. New tables: Delivery, DeliveryItem, Invoice, InvoiceItem
--    (Delivery/Invoice carry a temporary "_legacyOrderId" bridging column, used only
--    during this migration to wire up child rows and the Payment repoint below, then dropped)
-- ============================================================
CREATE TABLE "Delivery" (
    "id" SERIAL NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "salesOrderId" INTEGER NOT NULL,
    "proofOfDelivery" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "_legacyOrderId" INTEGER,
    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryItem" (
    "id" SERIAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batchNumber" TEXT NOT NULL DEFAULT 'DEFAULT',
    "boxBarcode" TEXT,
    "expiryDate" TIMESTAMP(3),
    "deliveryId" INTEGER NOT NULL,
    "salesOrderItemId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    CONSTRAINT "DeliveryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "invoiceNumber" TEXT,
    "salesOrderId" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "_legacyOrderId" INTEGER,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceItem" (
    "id" SERIAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "salesOrderItemId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- ============================================================
-- 5. Data migration: Invoice + InvoiceItem, from every SalesOrder that had an invoiceNumber
--    (fully invoiced under the old all-or-nothing model)
-- ============================================================
INSERT INTO "Invoice" ("invoiceNumber", "salesOrderId", "totalAmount", "paymentStatus", "amountPaid", "createdAt", "updatedAt", "_legacyOrderId")
SELECT "invoiceNumber", "id", "totalAmount", "paymentStatus", "amountPaid", "createdAt", "updatedAt", "id"
FROM "SalesOrder"
WHERE "invoiceNumber" IS NOT NULL;

INSERT INTO "InvoiceItem" ("quantity", "price", "invoiceId", "salesOrderItemId", "productId")
SELECT soi."quantity", soi."price", inv."id", soi."id", soi."productId"
FROM "SalesOrderItem" soi
JOIN "Invoice" inv ON inv."_legacyOrderId" = soi."salesOrderId";

UPDATE "SalesOrderItem" soi
SET "quantityInvoiced" = soi."quantity"
WHERE EXISTS (SELECT 1 FROM "Invoice" inv WHERE inv."_legacyOrderId" = soi."salesOrderId");

-- ============================================================
-- 6. Repoint Payment from Order to the new Invoice
-- ============================================================
ALTER TABLE "Payment" ADD COLUMN "invoiceId" INTEGER;

UPDATE "Payment" p
SET "invoiceId" = inv."id"
FROM "Invoice" inv
WHERE inv."_legacyOrderId" = p."orderId";

ALTER TABLE "Payment" ALTER COLUMN "invoiceId" SET NOT NULL;
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_orderId_fkey";
ALTER TABLE "Payment" DROP COLUMN "orderId";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 7. Data migration: Delivery + DeliveryItem, from every SalesOrder that was ever
--    confirmed (old status != 'DRAFT' means stock was already deducted historically)
--    -- read using the OLD status enum values, before they're remapped in step 8.
-- ============================================================
INSERT INTO "Delivery" ("status", "salesOrderId", "proofOfDelivery", "createdAt", "updatedAt", "_legacyOrderId")
SELECT
  CASE "status"::text
    WHEN 'PENDING' THEN 'PENDING'
    WHEN 'APPROVED' THEN 'PENDING'
    WHEN 'SHIPPED' THEN 'SHIPPED'
    WHEN 'DELIVERED' THEN 'DELIVERED'
    WHEN 'CANCELLED' THEN 'CANCELLED'
  END::"DeliveryStatus",
  "id", "proofOfDelivery", "createdAt", "updatedAt", "id"
FROM "SalesOrder"
WHERE "status"::text != 'DRAFT';

INSERT INTO "DeliveryItem" ("quantity", "batchNumber", "boxBarcode", "expiryDate", "deliveryId", "salesOrderItemId", "productId")
SELECT soi."quantity", soi."batchNumber", soi."boxBarcode", soi."expiryDate", d."id", soi."id", soi."productId"
FROM "SalesOrderItem" soi
JOIN "Delivery" d ON d."_legacyOrderId" = soi."salesOrderId";

UPDATE "SalesOrderItem" soi
SET "quantityDelivered" = soi."quantity"
WHERE EXISTS (SELECT 1 FROM "Delivery" d WHERE d."_legacyOrderId" = soi."salesOrderId");

-- Drop the temporary bridging columns now that everything is wired up.
ALTER TABLE "Delivery" DROP COLUMN "_legacyOrderId";
ALTER TABLE "Invoice" DROP COLUMN "_legacyOrderId";

-- ============================================================
-- 8. Convert SalesOrder.status from the old OrderStatus enum to the new SalesOrderStatus enum
-- ============================================================
ALTER TABLE "SalesOrder" ADD COLUMN "status_new" "SalesOrderStatus";

UPDATE "SalesOrder"
SET "status_new" = CASE "status"::text
    WHEN 'DRAFT' THEN 'DRAFT'
    WHEN 'PENDING' THEN 'CONFIRMED'
    WHEN 'APPROVED' THEN 'CONFIRMED'
    WHEN 'SHIPPED' THEN 'CONFIRMED'
    WHEN 'DELIVERED' THEN 'DONE'
    WHEN 'CANCELLED' THEN 'CANCELLED'
  END::"SalesOrderStatus";

ALTER TABLE "SalesOrder" DROP COLUMN "status";
ALTER TABLE "SalesOrder" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "SalesOrder" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "SalesOrder" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "OrderStatus";

-- ============================================================
-- 9. Drop the columns that moved out to Delivery/Invoice
-- ============================================================
ALTER TABLE "SalesOrder" DROP COLUMN "invoiceNumber";
ALTER TABLE "SalesOrder" DROP COLUMN "paymentStatus";
ALTER TABLE "SalesOrder" DROP COLUMN "amountPaid";
ALTER TABLE "SalesOrder" DROP COLUMN "proofOfDelivery";

ALTER TABLE "SalesOrderItem" DROP COLUMN "batchNumber";
ALTER TABLE "SalesOrderItem" DROP COLUMN "boxBarcode";
ALTER TABLE "SalesOrderItem" DROP COLUMN "expiryDate";

-- ============================================================
-- 10. Foreign keys + indexes for the new tables
-- ============================================================
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Delivery_salesOrderId_idx" ON "Delivery"("salesOrderId");
CREATE INDEX "DeliveryItem_deliveryId_idx" ON "DeliveryItem"("deliveryId");
CREATE INDEX "Invoice_salesOrderId_idx" ON "Invoice"("salesOrderId");
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

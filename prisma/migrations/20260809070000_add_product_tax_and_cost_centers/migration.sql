-- Product default tax
ALTER TABLE "Product" ADD COLUMN "taxId" INTEGER;

ALTER TABLE "Product" ADD CONSTRAINT "Product_taxId_fkey"
  FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cost center reporting dimension on Sales/Purchase documents
ALTER TABLE "SalesOrder" ADD COLUMN "costCenterId" INTEGER;

ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_costCenterId_fkey"
  FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD COLUMN "costCenterId" INTEGER;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_costCenterId_fkey"
  FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder" ADD COLUMN "costCenterId" INTEGER;

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_costCenterId_fkey"
  FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Bill" ADD COLUMN "costCenterId" INTEGER;

ALTER TABLE "Bill" ADD CONSTRAINT "Bill_costCenterId_fkey"
  FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: PosSession — till reconciliation fields
ALTER TABLE "PosSession" ADD COLUMN "openingCash" DOUBLE PRECISION;
ALTER TABLE "PosSession" ADD COLUMN "expectedCash" DOUBLE PRECISION;
ALTER TABLE "PosSession" ADD COLUMN "countedCash" DOUBLE PRECISION;
ALTER TABLE "PosSession" ADD COLUMN "cashVariance" DOUBLE PRECISION;

-- AlterTable: CompanySettings — Configure POS defaults
ALTER TABLE "CompanySettings" ADD COLUMN "posDefaultWarehouseId" INTEGER;
ALTER TABLE "CompanySettings" ADD COLUMN "posDefaultPaymentMethodId" INTEGER;
ALTER TABLE "CompanySettings" ADD COLUMN "posRequireCustomer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanySettings" ADD COLUMN "posReceiptFooter" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "posAutoPrintReceipt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanySettings" ADD COLUMN "posMaxDiscountPercent" DOUBLE PRECISION;
ALTER TABLE "CompanySettings" ADD COLUMN "posRequireCashCount" BOOLEAN NOT NULL DEFAULT false;

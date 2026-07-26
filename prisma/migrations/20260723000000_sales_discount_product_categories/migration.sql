-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('GOODS', 'SERVICE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "categoryId" INTEGER,
ADD COLUMN     "posActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "posCategoryId" INTEGER,
ADD COLUMN     "type" "ProductType" NOT NULL DEFAULT 'GOODS';

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "customerReference" TEXT,
ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "termsAndConditions" TEXT;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "lineDiscountType" TEXT,
ADD COLUMN     "lineDiscountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "listPrice" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "customerReference" TEXT,
ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "termsAndConditions" TEXT;

-- AlterTable
ALTER TABLE "SalesOrderItem" ADD COLUMN     "lineDiscountType" TEXT,
ADD COLUMN     "lineDiscountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "listPrice" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "ProductCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PosCategory_name_key" ON "PosCategory"("name");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_posCategoryId_fkey" FOREIGN KEY ("posCategoryId") REFERENCES "PosCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

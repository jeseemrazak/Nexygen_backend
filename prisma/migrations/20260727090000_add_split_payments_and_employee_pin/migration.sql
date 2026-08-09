-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "restaurantPinHash" TEXT;

-- CreateTable
CREATE TABLE "PosSalePayment" (
    "id" SERIAL NOT NULL,
    "posSaleId" INTEGER NOT NULL,
    "paymentMethodId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosSalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosSalePayment_posSaleId_idx" ON "PosSalePayment"("posSaleId");

-- CreateIndex
CREATE INDEX "PosSalePayment_paymentMethodId_idx" ON "PosSalePayment"("paymentMethodId");

-- AddForeignKey
ALTER TABLE "PosSalePayment" ADD CONSTRAINT "PosSalePayment_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSalePayment" ADD CONSTRAINT "PosSalePayment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Re-point RestaurantOrder.openedById from PosStaff to Employee (restaurant staff are sourced
-- from the Employee/Payroll module, not the separate walk-in-POS staff list).
ALTER TABLE "RestaurantOrder" DROP CONSTRAINT "RestaurantOrder_openedById_fkey";

ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

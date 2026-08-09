-- Remove the Restaurant module entirely (floor plan, table service, KDS, tickets/waitlist,
-- KOT printing, restaurant-PIN staff auth). The user rejected this module outright in favor of
-- upgrading the plain walk-in POS to match Odoo POS instead. Drops children before parents.

-- DropTable
DROP TABLE IF EXISTS "RestaurantOrderItem";

-- DropTable
DROP TABLE IF EXISTS "RestaurantTicket";

-- DropTable
DROP TABLE IF EXISTS "RestaurantOrder";

-- DropTable
DROP TABLE IF EXISTS "RestaurantTable";

-- DropTable
DROP TABLE IF EXISTS "RestaurantFloor";

-- DropEnum
DROP TYPE IF EXISTS "RestaurantOrderStatus";

-- DropEnum
DROP TYPE IF EXISTS "KitchenItemStatus";

-- DropEnum
DROP TYPE IF EXISTS "RestaurantTicketStatus";

-- AlterTable
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "restaurantPinHash";
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "defaultWarehouseId";

-- AlterTable
ALTER TABLE "CompanySettings" DROP COLUMN IF EXISTS "kotAutoPrint";
ALTER TABLE "CompanySettings" DROP COLUMN IF EXISTS "kotFooterText";

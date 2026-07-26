-- AlterEnum
-- Fixes a latent bug: deliveries.service.ts has posted JournalEntry rows with
-- sourceType: 'SALES_DELIVERY_COGS' since an earlier session, but this value was never actually
-- added to the JournalSourceType enum — silently never triggered until a Delivery line carried a
-- non-zero unit cost (COGS only posts when totalCost > 0).
ALTER TYPE "JournalSourceType" ADD VALUE 'SALES_DELIVERY_COGS';

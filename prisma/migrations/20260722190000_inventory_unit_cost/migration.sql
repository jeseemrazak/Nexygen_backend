-- Per-batch landed cost, so valuation/COGS can reflect what was actually paid for each batch
-- instead of a single mutable Product.costPrice. Purely additive, defaults to 0 ("not tracked
-- yet") for existing rows — callers fall back to Product.costPrice when unitCost is 0.

ALTER TABLE "Inventory" ADD COLUMN "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

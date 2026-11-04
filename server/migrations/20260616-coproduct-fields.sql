ALTER TABLE "CountingKainLines" ADD COLUMN IF NOT EXISTS "ProductType" integer NOT NULL DEFAULT 5;
ALTER TABLE "CountingKainLines" ADD COLUMN IF NOT EXISTS "InventStatus" varchar(20) NOT NULL DEFAULT 'A';

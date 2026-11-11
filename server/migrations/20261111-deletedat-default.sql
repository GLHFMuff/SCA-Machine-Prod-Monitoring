-- Ensure DeletedAt uses ERP/AX empty-date sentinel ('1900-01-01 00:00:00') instead of NULL
BEGIN;

UPDATE "CountingKainLines"
SET "DeletedAt" = TIMESTAMP '1900-01-01 00:00:00'
WHERE "DeletedAt" IS NULL;

UPDATE "CountingKainDefect"
SET "DeletedAt" = TIMESTAMP '1900-01-01 00:00:00'
WHERE "DeletedAt" IS NULL;

UPDATE "CountingKainJoinedPiece"
SET "DeletedAt" = TIMESTAMP '1900-01-01 00:00:00'
WHERE "DeletedAt" IS NULL;

ALTER TABLE "CountingKainLines"
  ALTER COLUMN "DeletedAt" SET DEFAULT TIMESTAMP '1900-01-01 00:00:00',
  ALTER COLUMN "DeletedAt" SET NOT NULL;

ALTER TABLE "CountingKainDefect"
  ALTER COLUMN "DeletedAt" SET DEFAULT TIMESTAMP '1900-01-01 00:00:00',
  ALTER COLUMN "DeletedAt" SET NOT NULL;

ALTER TABLE "CountingKainJoinedPiece"
  ALTER COLUMN "DeletedAt" SET DEFAULT TIMESTAMP '1900-01-01 00:00:00',
  ALTER COLUMN "DeletedAt" SET NOT NULL;

COMMIT;


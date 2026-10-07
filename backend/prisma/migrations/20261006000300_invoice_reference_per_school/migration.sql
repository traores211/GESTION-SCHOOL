-- Invoice.reference moves from "unique platform-wide" to "unique per school". Two schools of the
-- SaaS may now both number their first invoice INV-2026-00001 without colliding. Existing data
-- is already consistent (platform-wide uniqueness is a stricter version of per-school uniqueness)
-- so no data migration is needed; only the index swap.

-- DropIndex
DROP INDEX "Invoice_reference_key";

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_schoolId_reference_key" ON "Invoice"("schoolId", "reference");

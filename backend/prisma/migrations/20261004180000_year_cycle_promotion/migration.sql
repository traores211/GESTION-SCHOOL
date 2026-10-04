-- AlterTable
ALTER TABLE "AcademicYear" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'OUVERTE';

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "series" TEXT;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "outcomeAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PromotionBatch" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "fromClassId" TEXT NOT NULL,
    "toYearId" TEXT NOT NULL,
    "decisions" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "executedById" TEXT,
    "executedByName" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionBatch_schoolId_executedAt_idx" ON "PromotionBatch"("schoolId", "executedAt");

-- CreateIndex
CREATE INDEX "PromotionBatch_fromClassId_idx" ON "PromotionBatch"("fromClassId");

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'AUTRE',
ADD COLUMN     "documentDate" TIMESTAMP(3),
ADD COLUMN     "fileMime" TEXT,
ADD COLUMN     "filePath" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "replacesId" TEXT,
ADD COLUMN     "schoolId" TEXT,
ADD COLUMN     "staffId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIF',
ADD COLUMN     "uploadedById" TEXT,
ADD COLUMN     "uploadedByName" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'INTERNE',
ALTER COLUMN "url" DROP NOT NULL;

-- Documents recorded before this change belong to the school of their pupil
UPDATE "Document" d SET "schoolId" = s."schoolId" FROM "Student" s WHERE d."studentId" = s."id" AND d."schoolId" IS NULL;

-- CreateIndex
CREATE INDEX "Document_schoolId_status_idx" ON "Document"("schoolId", "status");

-- CreateIndex
CREATE INDEX "Document_staffId_idx" ON "Document"("staffId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

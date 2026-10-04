-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "contractType" TEXT,
ADD COLUMN     "countryOfOrigin" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "diploma" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "experienceYears" INTEGER,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "placeOfBirth" TEXT,
ADD COLUMN     "qualification" TEXT,
ADD COLUMN     "specialty" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "countryOfOrigin" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "entryDate" TIMESTAMP(3),
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "previousAverage" DOUBLE PRECISION,
ADD COLUMN     "previousClass" TEXT,
ADD COLUMN     "previousSchool" TEXT,
ADD COLUMN     "regime" TEXT;

-- AlterTable
ALTER TABLE "Parent" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "countryOfOrigin" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "employer" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "idNumber" TEXT,
ADD COLUMN     "idType" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "phone2" TEXT,
ADD COLUMN     "photoUrl" TEXT;

-- CreateTable
CREATE TABLE "Guardianship" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'AUTRE',
    "isLegalGuardian" BOOLEAN NOT NULL DEFAULT true,
    "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
    "canPickUp" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guardianship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Guardianship_studentId_idx" ON "Guardianship"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Guardianship_parentId_studentId_key" ON "Guardianship"("parentId", "studentId");

-- AddForeignKey
ALTER TABLE "Guardianship" ADD CONSTRAINT "Guardianship_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardianship" ADD CONSTRAINT "Guardianship_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing family links: the quality recorded on the parent becomes the quality of each link
INSERT INTO "Guardianship" ("id", "parentId", "studentId", "relation", "updatedAt")
SELECT 'gd_' || md5(l."A" || l."B"), l."A", l."B",
  CASE
    WHEN lower(p."relationship") IN ('père', 'pere', 'father') THEN 'PERE'
    WHEN lower(p."relationship") IN ('mère', 'mere', 'mother') THEN 'MERE'
    WHEN lower(p."relationship") IN ('tuteur', 'tutrice', 'guardian') THEN 'TUTEUR'
    ELSE 'AUTRE'
  END,
  CURRENT_TIMESTAMP
FROM "_ParentToStudent" l
JOIN "Parent" p ON p."id" = l."A";

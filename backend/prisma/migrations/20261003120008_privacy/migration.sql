-- AlterTable
ALTER TABLE "Admission" ADD COLUMN     "consentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "dataRetentionYears" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "privacyContact" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "anonymizedAt" TIMESTAMP(3);

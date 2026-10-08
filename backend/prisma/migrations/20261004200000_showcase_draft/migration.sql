-- AlterTable
ALTER TABLE "School" ADD COLUMN     "showcaseContent" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "showcaseDraft" JSONB,
ADD COLUMN     "showcaseDraftAt" TIMESTAMP(3),
ADD COLUMN     "showcasePublishedAt" TIMESTAMP(3);

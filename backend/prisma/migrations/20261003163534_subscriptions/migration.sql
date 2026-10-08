-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

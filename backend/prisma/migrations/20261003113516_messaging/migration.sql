-- AlterTable
ALTER TABLE "Parent" ADD COLUMN     "smsOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "smsEvents" TEXT NOT NULL DEFAULT 'ABSENCE,OVERDUE,ADMISSION,PAYMENT',
ADD COLUMN     "smsMonthlyQuota" INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'sms',
    "to" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "provider" TEXT NOT NULL,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "studentId" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageLog_dedupeKey_key" ON "MessageLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "MessageLog_schoolId_createdAt_idx" ON "MessageLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_schoolId_status_idx" ON "MessageLog"("schoolId", "status");

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "cardToken" TEXT;

-- CreateTable
CREATE TABLE "GateEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessPoint" TEXT,
    "method" TEXT NOT NULL DEFAULT 'MANUEL',
    "late" BOOLEAN NOT NULL DEFAULT false,
    "early" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "pickedUpParentId" TEXT,
    "pickedUpBy" TEXT,
    "recordedById" TEXT,
    "recordedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_cardToken_key" ON "Student"("cardToken");

-- CreateIndex
CREATE INDEX "GateEvent_schoolId_occurredAt_idx" ON "GateEvent"("schoolId", "occurredAt");

-- CreateIndex
CREATE INDEX "GateEvent_studentId_occurredAt_idx" ON "GateEvent"("studentId", "occurredAt");

-- AddForeignKey
ALTER TABLE "GateEvent" ADD CONSTRAINT "GateEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateEvent" ADD CONSTRAINT "GateEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

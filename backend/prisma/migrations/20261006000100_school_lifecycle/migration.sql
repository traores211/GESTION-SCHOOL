-- Lifecycle machine of a school's subscription: one row per state transition, append-only.
-- The current status stays on Organisation.subscriptionStatus (unchanged); this table carries
-- the history, who did what and why. Values of toStatus are enforced by the LifecycleService.

-- CreateTable
CREATE TABLE "SchoolLifecycleEvent" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "fromPlan" TEXT,
    "toPlan" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "message" TEXT,
    "operatorId" TEXT,
    "operatorName" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolLifecycleEvent_organisationId_createdAt_idx"
  ON "SchoolLifecycleEvent"("organisationId", "createdAt");

-- AddForeignKey
ALTER TABLE "SchoolLifecycleEvent" ADD CONSTRAINT "SchoolLifecycleEvent_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLifecycleEvent" ADD CONSTRAINT "SchoolLifecycleEvent_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the lifecycle timeline for the schools already in the system: one SIGNUP event per
-- organisation that matches its current status, so dashboards never show a blank history.
-- Uses the organisation's own createdAt so the event lands at the right place in time.
INSERT INTO "SchoolLifecycleEvent" (
  "id", "organisationId", "fromStatus", "toStatus", "toPlan", "trialEndsAt",
  "reason", "trigger", "createdAt"
)
SELECT
  'legacy-' || "id",
  "id",
  NULL,
  "subscriptionStatus",
  "subscriptionPlan",
  "trialEndsAt",
  'SIGNUP',
  'MANUAL',
  "createdAt"
FROM "Organisation";

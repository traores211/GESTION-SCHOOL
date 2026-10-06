-- Per-organisation overrides on top of the plan baseline (plans live in code, overrides in DB).
-- One row per organisation; nullable columns mean "no override, keep the plan default".

-- CreateTable
CREATE TABLE "OrganisationQuotaOverride" (
    "organisationId" TEXT NOT NULL,
    "students" INTEGER,
    "staffUsers" INTEGER,
    "classes" INTEGER,
    "schools" INTEGER,
    "customDomains" INTEGER,
    "storageMb" INTEGER,
    "smsMonthly" INTEGER,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationQuotaOverride_pkey" PRIMARY KEY ("organisationId")
);

-- AddForeignKey
ALTER TABLE "OrganisationQuotaOverride" ADD CONSTRAINT "OrganisationQuotaOverride_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

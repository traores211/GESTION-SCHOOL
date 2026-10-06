-- Custom domains per school: each school can expose itself on its own hostname (mon-ecole-1.ci),
-- a subdomain of the SaaS platform (ecole1.mon-saas-ecole.ci), or additional aliases (www.*).
-- The hostname → school mapping goes through this table; the HTTP Host header is never trusted
-- as proof of tenancy by itself.

-- CreateTable
CREATE TABLE "SchoolDomain" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CUSTOM_DOMAIN',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT NOT NULL,
    "verificationMethod" TEXT NOT NULL DEFAULT 'DNS_TXT',
    "verifiedAt" TIMESTAMP(3),
    "sslStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "sslIssuedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDomain_pkey" PRIMARY KEY ("id")
);

-- A hostname can only point at a single school in the whole platform (prevents takeover).
-- CreateIndex
CREATE UNIQUE INDEX "SchoolDomain_hostname_key" ON "SchoolDomain"("hostname");

-- CreateIndex
CREATE INDEX "SchoolDomain_schoolId_idx" ON "SchoolDomain"("schoolId");

-- CreateIndex
CREATE INDEX "SchoolDomain_organisationId_idx" ON "SchoolDomain"("organisationId");

-- CreateIndex
CREATE INDEX "SchoolDomain_status_idx" ON "SchoolDomain"("status");

-- Only one primary domain per school.
-- CreateIndex
CREATE UNIQUE INDEX "SchoolDomain_schoolId_isPrimary_key"
  ON "SchoolDomain"("schoolId")
  WHERE "isPrimary" = true;

-- AddForeignKey
ALTER TABLE "SchoolDomain" ADD CONSTRAINT "SchoolDomain_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDomain" ADD CONSTRAINT "SchoolDomain_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDomain" ADD CONSTRAINT "SchoolDomain_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

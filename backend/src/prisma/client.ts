import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/** Prisma 7 reaches PostgreSQL through a driver adapter instead of its own engine. */
export function prismaAdapter() {
  return new PrismaPg({ connectionString: process.env.DATABASE_URL });
}

/** Plain client for the seeds and one-off scripts (no encryption, amounts stay `Decimal`). */
export function createPrismaClient() {
  return new PrismaClient({ adapter: prismaAdapter() });
}

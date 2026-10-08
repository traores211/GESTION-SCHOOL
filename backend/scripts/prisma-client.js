// Plain Prisma client for the shell scripts and the end-to-end checks (same wiring as src/prisma/client.ts).
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

/** Prisma 7 reaches PostgreSQL through a driver adapter instead of its own engine. */
function createPrismaClient() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}

module.exports = { createPrismaClient };

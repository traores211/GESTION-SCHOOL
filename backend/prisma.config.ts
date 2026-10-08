import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration (migrate, generate, seed). The connection string no longer lives in
 * schema.prisma. It is read straight from the environment rather than with `env()`, which throws
 * when the variable is missing: `prisma generate` runs at image build time, without a database.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});

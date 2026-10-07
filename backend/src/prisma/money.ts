import { Prisma } from '@prisma/client';

/**
 * The monetary columns are stored as `Decimal(14,2)` in Postgres for exact FCFA arithmetic, but
 * the rest of the backend handles them as `number`. The Prisma middleware
 * (`PrismaService` constructor) converts every `Prisma.Decimal` instance to a `number` at read
 * time. This helper covers the few remaining edges where TypeScript still sees the generated
 * `Decimal` type (aggregates, raw $queryRaw, boundary conversions).
 */

/** Converts a value coming from Prisma (number, Decimal or null) to a plain number. */
export function money(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();
  return Number(value);
}

/** Keeps `null` as `null`, converts anything else via `money()`. */
export function moneyOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return money(value);
}

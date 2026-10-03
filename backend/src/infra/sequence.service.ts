import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Atomic counters for human-readable numbers (invoice references, student numbers…). The increment is
 * a single INSERT … ON CONFLICT DO UPDATE … RETURNING, so two secretaries saving at the same time
 * always get different numbers. On first use of a key, the counter starts after the highest number
 * already in the database (`seed`).
 */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(key: string, seed: () => Promise<number>, db: Db = this.prisma): Promise<number> {
    const exists = await db.sequence.findUnique({ where: { key }, select: { key: true } });
    if (!exists) {
      const start = await seed();
      // Concurrent first uses: only one insert wins, the others fall through to the increment.
      await db.$executeRaw`INSERT INTO "Sequence" ("key", "value", "updatedAt") VALUES (${key}, ${start}, NOW()) ON CONFLICT ("key") DO NOTHING`;
    }
    const rows = await db.$queryRaw<{ value: number }[]>`
      UPDATE "Sequence" SET "value" = "value" + 1, "updatedAt" = NOW() WHERE "key" = ${key} RETURNING "value"`;
    return rows[0].value;
  }

  /** Highest numeric suffix among values starting with `prefix` (e.g. "INV-2026-" → 18). */
  static maxSuffix(values: (string | null)[], prefix: string): number {
    return values.reduce((max, v) => {
      if (!v?.startsWith(prefix)) return max;
      const n = Number(v.slice(prefix.length));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
  }

  /** "INV-2026-00019": next invoice reference (unique across the platform). */
  async invoiceReference(db: Db = this.prisma, year = new Date().getFullYear()) {
    const prefix = `INV-${year}-`;
    const n = await this.next(`invoice:${year}`, async () => {
      const rows = await db.invoice.findMany({ where: { reference: { startsWith: prefix } }, select: { reference: true } });
      return SequenceService.maxSuffix(rows.map((r) => r.reference), prefix);
    }, db);
    return `${prefix}${String(n).padStart(5, '0')}`;
  }

  /** "2026-0431": next student number (unique across the platform). */
  async matricule(db: Db = this.prisma, year = new Date().getFullYear()) {
    const prefix = `${year}-`;
    const n = await this.next(`matricule:${year}`, async () => {
      const rows = await db.student.findMany({ where: { matricule: { startsWith: prefix } }, select: { matricule: true } });
      return SequenceService.maxSuffix(rows.map((r) => r.matricule), prefix);
    }, db);
    return `${prefix}${String(n).padStart(4, '0')}`;
  }

  /** "ADM-2025-0042": next application reference within a school and academic year. */
  async admissionReference(schoolId: string, yearName: string, db: Db = this.prisma) {
    const prefix = `ADM-${yearName.slice(0, 4)}-`;
    const n = await this.next(`admission:${schoolId}:${prefix}`, async () => {
      const rows = await db.admission.findMany({ where: { schoolId, reference: { startsWith: prefix } }, select: { reference: true } });
      return SequenceService.maxSuffix(rows.map((r) => r.reference), prefix);
    }, db);
    return `${prefix}${String(n).padStart(4, '0')}`;
  }
}

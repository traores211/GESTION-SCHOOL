import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Atomic per-school counter (fixes DB-03: count()+1 produced duplicates under concurrency).
 * A single INSERT ... ON CONFLICT DO UPDATE ... RETURNING is atomic in PostgreSQL.
 */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(schoolId: string, key: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ value: number }[]>`
      INSERT INTO "Sequence" ("schoolId", "key", "value") VALUES (${schoolId}, ${key}, 1)
      ON CONFLICT ("schoolId", "key") DO UPDATE SET "value" = "Sequence"."value" + 1
      RETURNING "value"`;
    return Number(rows[0].value);
  }

  /** Initialises a counter above existing data (used once per key, e.g. schools created before sequences). */
  async nextAtLeast(schoolId: string, key: string, floor: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ value: number }[]>`
      INSERT INTO "Sequence" ("schoolId", "key", "value") VALUES (${schoolId}, ${key}, ${floor + 1})
      ON CONFLICT ("schoolId", "key") DO UPDATE SET "value" = GREATEST("Sequence"."value", ${floor}) + 1
      RETURNING "value"`;
    return Number(rows[0].value);
  }

  async matricule(schoolId: string): Promise<string> {
    const year = new Date().getFullYear();
    const existing = await this.prisma.student.count({ where: { schoolId, matricule: { startsWith: `${year}-` } } });
    const n = await this.nextAtLeast(schoolId, `matricule:${year}`, existing);
    return `${year}-${String(n).padStart(4, '0')}`;
  }

  async invoiceReference(schoolId: string): Promise<string> {
    const year = new Date().getFullYear();
    const existing = await this.prisma.invoice.count({ where: { schoolId, reference: { startsWith: `INV-${year}-` } } });
    const n = await this.nextAtLeast(schoolId, `invoice:${year}`, existing);
    return `INV-${year}-${String(n).padStart(5, '0')}`;
  }

  async documentNumber(schoolId: string): Promise<string> {
    const year = new Date().getFullYear();
    const n = await this.next(schoolId, `document:${year}`);
    return `DOC-${year}-${String(n).padStart(5, '0')}`;
  }
}

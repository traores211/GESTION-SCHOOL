import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ENCRYPTED_FIELDS, decryptResult, encryptData, loadKey } from '../infra/field-crypto';

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Walk a Prisma result and convert every `Prisma.Decimal` instance to a plain JavaScript number.
 * Decimal columns in Postgres (numeric(14,2)) give us exact storage of FCFA amounts (no float
 * drift), while the rest of the application code keeps working with `number`. The conversion
 * covers nested relations, arrays, aggregate payloads (`_sum`, `_avg`, `_min`, `_max`) and
 * groupBy results. Primitive values and dates are returned untouched.
 */
function decimalsToNumbers(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = decimalsToNumbers(value[i]);
    return value;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) obj[k] = decimalsToNumbers(obj[k]);
    return obj;
  }
  return value;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly encrypting: boolean;

  /** True when sensitive columns are encrypted at rest (DATA_ENCRYPTION_KEY set). */
  get encryptionActive() {
    return this.encrypting;
  }

  constructor() {
    super();

    // Monetary columns are stored as Decimal(14,2) but the rest of the app works with `number`.
    // Convert on the way out, before anything else sees the result. Runs even when encryption is
    // off, so the behaviour is identical in dev and in prod.
    this.$use(async (params, next) => {
      const result = await next(params);
      return decimalsToNumbers(result);
    });

    const key = loadKey();
    this.encrypting = !!key;
    if (!key) {
      new Logger('Prisma').warn('DATA_ENCRYPTION_KEY absente ou invalide : les données sensibles ne sont pas chiffrées');
      return;
    }
    // Sensitive columns (see ENCRYPTED_FIELDS) are encrypted on the way in and decrypted on the way out.
    this.$use(async (params, next) => {
      if (params.model && ENCRYPTED_FIELDS[params.model] && params.args) {
        encryptData(params.model, params.args.data, key);
        if (params.action === 'upsert') {
          encryptData(params.model, params.args.create, key);
          encryptData(params.model, params.args.update, key);
        }
      }
      return decryptResult(await next(params), key);
    });
  }

  async onModuleInit() {
    await this.$connect();
    if (this.encrypting && !process.env.JEST_WORKER_ID) {
      void this.encryptExisting().catch((err: Error) => new Logger('Prisma').error(`Chiffrement des données existantes : ${err.message}`));
    }
  }

  /**
   * Values written before encryption was switched on are still in clear text: they are encrypted
   * here, by batches, at start-up. Once done the queries return nothing and cost next to nothing.
   */
  async encryptExisting(batch = 500) {
    let total = 0;
    for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegate = (this as any)[lowerFirst(model)];
      for (const field of fields) {
        for (;;) {
          const rows: { id: string }[] = await delegate.findMany({
            where: { AND: [{ [field]: { not: null } }, { NOT: { [field]: { startsWith: 'enc:v1:' } } }, { NOT: { [field]: '' } }] },
            select: { id: true, [field]: true },
            take: batch,
          });
          if (!rows.length) break;
          for (const row of rows) {
            // Reading gives the clear value, writing it back goes through the encryption layer.
            await delegate.update({ where: { id: row.id }, data: { [field]: (row as Record<string, string>)[field] } });
          }
          total += rows.length;
          if (rows.length < batch) break;
        }
      }
    }
    if (total) new Logger('Prisma').log(`${total} valeur(s) sensible(s) chiffrée(s)`);
    return total;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, from, throwError } from 'rxjs';
import { catchError, mergeMap, tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

/** Request bodies never keep secrets in the journal. */
const SECRET_KEYS = /pass(word)?|token|totp|secret|code$|refresh|authorization|cookie/i;
const MAX_JSON = 4000;

/** Writes that change nothing (checks, previews, analyses, chat, read receipts) are not journaled. */
const SKIP = [
  /^auth\/(login|refresh|logout|forgot-password|reset-password)$/,
  /^timetable\/check$/,
  /^timetable\/(generate\/preview|import\/(analyze|resolve|preview)|planning\/import\/analyze)$/,
  /^assistant\//,
  /^notifications\//,
  /^public\//,
  /^audit/,
];

/** Route prefix → Prisma model, to keep the state "before" of a modified or deleted record. */
const SNAPSHOT: { pattern: RegExp; model: string; omit?: string[] }[] = [
  { pattern: /^students\/([^/]+)$/, model: 'student' },
  { pattern: /^parents\/([^/]+)$/, model: 'parent' },
  { pattern: /^classes\/([^/]+)$/, model: 'class' },
  { pattern: /^subjects\/([^/]+)$/, model: 'subject' },
  { pattern: /^staff\/([^/]+)(\/salary)?$/, model: 'user', omit: ['password', 'totpSecret'] },
  { pattern: /^announcements\/([^/]+)$/, model: 'announcement' },
  { pattern: /^payroll\/([^/]+)(\/(validate|pay))?$/, model: 'payslip' },
  { pattern: /^admissions\/([^/]+)$/, model: 'admission' },
  { pattern: /^attendance\/([^/]+)\/justify$/, model: 'attendance' },
  { pattern: /^billing\/invoices\/([^/]+)$/, model: 'invoice' },
  { pattern: /^academic-years\/([^/]+)\/set-current$/, model: 'academicYear' },
  { pattern: /^timetable\/rooms\/([^/]+)$/, model: 'room' },
  { pattern: /^transport\/vehicles\/([^/]+)$/, model: 'vehicle' },
  { pattern: /^transport\/routes\/([^/]+)$/, model: 'transportRoute' },
];

export function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return `[fichier ${value.length} octets]`;
  if (Array.isArray(value)) return value.length > 50 ? [...value.slice(0, 50).map((v) => sanitize(v, depth + 1)), `… ${value.length - 50} de plus`] : value.map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    if (depth > 4) return '[…]';
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET_KEYS.test(k) ? '[masqué]' : sanitize(v, depth + 1);
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

function json(value: unknown) {
  if (value === undefined) return null;
  const text = JSON.stringify(sanitize(value));
  return text.length > MAX_JSON ? `${text.slice(0, MAX_JSON)}…` : text;
}

const ACTIONS: Record<string, string> = { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' };

/**
 * Journal of every write made by a signed-in user: who, what, on which record, the state before
 * (for identified records), what was sent (secrets masked), from where, and whether it succeeded.
 * Journaling never breaks the request: failures are logged and ignored.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;
    const action = ACTIONS[method];
    const path = String(req.originalUrl || req.url || '')
      .split('?')[0]
      .replace(/^\/api\//, '')
      .replace(/\/$/, '');
    if (!action || !req.user || SKIP.some((p) => p.test(path))) return next.handle();

    const snapshotRule = method !== 'POST' || /\/(validate|pay|set-current|justify)$/.test(path) ? SNAPSHOT.find((s) => s.pattern.test(path)) : undefined;
    const recordId = snapshotRule ? path.match(snapshotRule.pattern)![1] : (req.params?.id ?? null);

    const before = snapshotRule ? this.snapshot(snapshotRule.model, recordId!, snapshotRule.omit) : Promise.resolve(null);
    return from(before).pipe(
      mergeMap((oldValues) =>
        next.handle().pipe(
          tap((response) => void this.write(req, path, action, recordId ?? (response as { id?: string })?.id ?? null, oldValues, 'OK')),
          catchError((err) => {
            const status = err?.status ?? err?.getStatus?.() ?? 500;
            void this.write(req, path, status === 403 ? 'DENIED' : action, recordId, oldValues, `ERREUR ${status}`);
            return throwError(() => err);
          }),
        ),
      ),
    );
  }

  private async snapshot(model: string, id: string, omit: string[] = []) {
    try {
      const delegate = (this.prisma as unknown as Record<string, { findUnique: (a: object) => Promise<Record<string, unknown> | null> }>)[model];
      const row = await delegate.findUnique({ where: { id } });
      if (!row) return null;
      for (const key of omit) delete row[key];
      return row;
    } catch {
      return null;
    }
  }

  private async write(req: { user: { userId: string; schoolId: string | null }; body: unknown; ip?: string; headers: Record<string, string> }, path: string, action: string, resourceId: string | null, oldValues: unknown, result: string) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          resource: path.replace(/\/[0-9a-z]{20,}|\/[0-9a-f-]{36}/gi, '/:id'),
          resourceId: resourceId ?? '-',
          userId: req.user.userId,
          schoolId: req.user.schoolId,
          oldValues: json(oldValues),
          newValues: json({ result, body: req.body }),
          ipAddress: req.ip?.replace('::ffff:', '') ?? null,
          userAgent: req.headers['user-agent']?.slice(0, 200) ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Journal non écrit (${path}): ${(err as Error).message}`);
    }
  }
}

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/** Never sent to a client, whatever a service returns by mistake. */
const SENSITIVE_KEYS = new Set(['password', 'totpSecret', 'tokenHash', 'cardToken']);

/** Removes credentials from a response, in place, at any depth. */
export function stripSensitive<T>(value: T, depth = 0): T {
  if (value === null || typeof value !== 'object' || depth > 12) return value;
  if (Array.isArray(value)) {
    for (const item of value) stripSensitive(item, depth + 1);
    return value;
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SENSITIVE_KEYS.has(key)) delete record[key];
    else stripSensitive(record[key], depth + 1);
  }
  return value;
}

/**
 * Safety net for every JSON response: password hashes, two-factor secrets and token hashes are
 * removed even when a query loaded a whole user record (`include: { user: true }`). Services
 * should still select only what they need; this guarantees a mistake does not become a leak.
 */
@Injectable()
export class SensitiveFieldsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((body) => stripSensitive(body)));
  }
}

/** Fields of a user that other staff may see (teacher of a class, author of a payslip…). */
export const PUBLIC_USER = { select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, status: true } } as const;

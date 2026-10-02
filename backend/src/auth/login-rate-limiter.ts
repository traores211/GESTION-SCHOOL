import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

/**
 * Brute-force guard for /auth/login: after MAX_FAILURES failed attempts on the same email within
 * WINDOW_MS, further attempts are refused until the window expires. In-memory (single instance).
 */
@Injectable()
export class LoginRateLimiter {
  private readonly failures = new Map<string, { count: number; firstAt: number }>();

  assertAllowed(email: string, now = Date.now()) {
    const entry = this.failures.get(email.toLowerCase());
    if (!entry) return;
    if (now - entry.firstAt > WINDOW_MS) {
      this.failures.delete(email.toLowerCase());
      return;
    }
    if (entry.count >= MAX_FAILURES) {
      const minutes = Math.ceil((WINDOW_MS - (now - entry.firstAt)) / 60000);
      throw new HttpException(
        `Trop de tentatives de connexion. Réessayez dans ${minutes} minute(s).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(email: string, now = Date.now()) {
    const key = email.toLowerCase();
    const entry = this.failures.get(key);
    if (!entry || now - entry.firstAt > WINDOW_MS) this.failures.set(key, { count: 1, firstAt: now });
    else entry.count += 1;
  }

  reset(email: string) {
    this.failures.delete(email.toLowerCase());
  }
}

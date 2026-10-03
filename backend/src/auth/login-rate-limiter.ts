import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../infra/redis.service';

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES_PER_ACCOUNT = 10;
const MAX_FAILURES_PER_IP = 50;

/**
 * Brute-force guard for sign-in and password reset: failed attempts are counted per account and per
 * IP address over 15 minutes. Counters live in Redis (shared between instances, survive restarts),
 * with an in-memory fallback.
 */
@Injectable()
export class LoginRateLimiter {
  constructor(private readonly store: RedisService) {}

  private keys(email: string, ip?: string) {
    return { account: `auth:fail:${email.toLowerCase()}`, ip: ip ? `auth:fail-ip:${ip}` : null };
  }

  async assertAllowed(email: string, ip?: string) {
    const k = this.keys(email, ip);
    const [account, byIp] = await Promise.all([this.store.get(k.account), k.ip ? this.store.get(k.ip) : Promise.resolve(null)]);
    if (Number(account ?? 0) >= MAX_FAILURES_PER_ACCOUNT || Number(byIp ?? 0) >= MAX_FAILURES_PER_IP) {
      throw new HttpException('Trop de tentatives. Réessayez dans 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async recordFailure(email: string, ip?: string) {
    const k = this.keys(email, ip);
    await this.store.incr(k.account, WINDOW_SECONDS);
    if (k.ip) await this.store.incr(k.ip, WINDOW_SECONDS);
  }

  async reset(email: string) {
    await this.store.del(this.keys(email).account);
  }

  /** Generic throttle (e.g. password reset requests): true while under the limit. */
  async hit(key: string, max: number, windowSeconds: number) {
    return (await this.store.incr(`throttle:${key}`, windowSeconds)) <= max;
  }
}

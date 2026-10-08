import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Small key-value store for counters, rate limits and caches. Uses Redis when REDIS_URL is set and
 * reachable, and falls back to process memory otherwise (single instance, lost on restart).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  private client: Redis | null = null;
  private ready = false;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();

  constructor() {
    const url = process.env.REDIS_URL;
    // Unit tests run with the memory store (Jest keeps NODE_ENV=development inside the container).
    if (!url || process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;
    this.client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    this.client.on('ready', () => {
      this.ready = true;
      this.logger.log('Connected');
    });
    this.client.on('end', () => (this.ready = false));
    this.client.on('error', (err) => {
      if (this.ready) this.logger.warn(`Redis unavailable, using memory: ${err.message}`);
      this.ready = false;
    });
  }

  get usingRedis() {
    return !!this.client && this.ready;
  }

  private sweep(key: string) {
    const e = this.memory.get(key);
    if (e && e.expiresAt <= Date.now()) this.memory.delete(key);
    return this.memory.get(key);
  }

  /** Increments a counter and sets its expiry on first increment; returns the new value. */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    if (this.usingRedis) {
      try {
        const n = await this.client!.incr(key);
        if (n === 1) await this.client!.expire(key, ttlSeconds);
        return n;
      } catch {
        /* fall through to memory */
      }
    }
    const e = this.sweep(key);
    const n = (e ? Number(e.value) : 0) + 1;
    this.memory.set(key, { value: String(n), expiresAt: e?.expiresAt ?? Date.now() + ttlSeconds * 1000 });
    return n;
  }

  async get(key: string): Promise<string | null> {
    if (this.usingRedis) {
      try {
        return await this.client!.get(key);
      } catch {
        /* memory */
      }
    }
    return this.sweep(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.usingRedis) {
      try {
        await this.client!.set(key, value, 'EX', ttlSeconds);
        return;
      } catch {
        /* memory */
      }
    }
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    if (this.usingRedis) {
      try {
        await this.client!.del(...keys);
      } catch {
        /* memory */
      }
    }
    keys.forEach((k) => this.memory.delete(k));
  }

  /** Cached JSON value: computes and stores it when missing. */
  async remember<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const hit = await this.get(key);
    if (hit) return JSON.parse(hit) as T;
    const value = await compute();
    await this.set(key, JSON.stringify(value), ttlSeconds);
    return value;
  }

  async ping(): Promise<'up' | 'memory'> {
    if (!this.client) return 'memory';
    try {
      await this.client.ping();
      return 'up';
    } catch {
      return 'memory';
    }
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined);
  }
}

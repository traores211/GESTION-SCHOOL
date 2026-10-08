import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './infra/redis.service';

export interface Health {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  cache: 'up' | 'memory';
  version: string;
  uptime: number;
  timestamp: string;
}

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness + database and cache reachability (container healthcheck, monitoring, home page). */
  async getHealth(): Promise<Health> {
    let database: Health['database'] = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      cache: await this.redis.ping(),
      version: process.env.APP_VERSION || '1.2.0',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}

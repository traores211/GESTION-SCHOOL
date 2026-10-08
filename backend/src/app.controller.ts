import { Body, Controller, Get, Headers, HttpCode, Logger, Post, Req, Res } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { renderMetrics } from './infra/metrics';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AppService } from './app.service';
import { LoginRateLimiter } from './auth/login-rate-limiter';
import { captureClientError } from './infra/monitoring';

class ClientErrorDto {
  @IsString()
  @MaxLength(500)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  digest?: string;
}

@Controller()
@ApiTags('Health')
export class AppController {
  private readonly logger = new Logger('Browser');

  constructor(
    private readonly appService: AppService,
    private readonly limiter: LoginRateLimiter,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check: 200 when the database answers, 503 otherwise' })
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const health = await this.appService.getHealth();
    if (health.database === 'down') res.status(503);
    return health;
  }

  /**
   * Metrics for Prometheus. Closed unless METRICS_TOKEN is set; the scraper sends it as a bearer
   * token. In development (no token, not production) the page is open on the local machine.
   */
  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics (bearer METRICS_TOKEN)' })
  async metrics(@Headers('authorization') authorization: string | undefined, @Res() res: Response) {
    const token = process.env.METRICS_TOKEN;
    const open = !token && process.env.NODE_ENV !== 'production';
    const given = Buffer.from(authorization?.replace(/^Bearer\s+/i, '') ?? '');
    const expected = Buffer.from(token ?? '');
    if (!open && (!token || given.length !== expected.length || !timingSafeEqual(given, expected))) {
      res.status(404).json({ statusCode: 404, message: 'Not Found' });
      return;
    }
    const health = await this.appService.getHealth();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(
      renderMetrics({
        school_erp_database_up: { help: 'PostgreSQL reachable (1) or not (0).', value: health.database === 'up' ? 1 : 0 },
        school_erp_cache_up: { help: 'Redis reachable (1) or memory fallback (0).', value: health.cache === 'up' ? 1 : 0 },
      }),
    );
  }

  /** JavaScript errors from browsers (error pages, unhandled errors), throttled per IP. */
  @Post('client-errors')
  @HttpCode(204)
  async clientError(@Body() dto: ClientErrorDto, @Req() req: Request) {
    if (!(await this.limiter.hit(`client-error:${req.ip}`, 30, 600))) return;
    this.logger.warn({ msg: `Erreur navigateur : ${dto.message}`, url: dto.url, digest: dto.digest, userAgent: req.headers['user-agent'] });
    captureClientError(dto.message, { stack: dto.stack, url: dto.url, digest: dto.digest });
  }
}

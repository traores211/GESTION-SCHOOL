import { Body, Controller, Get, HttpCode, Logger, Post, Req, Res } from '@nestjs/common';
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

  /** JavaScript errors from browsers (error pages, unhandled errors), throttled per IP. */
  @Post('client-errors')
  @HttpCode(204)
  async clientError(@Body() dto: ClientErrorDto, @Req() req: Request) {
    if (!(await this.limiter.hit(`client-error:${req.ip}`, 30, 600))) return;
    this.logger.warn({ msg: `Erreur navigateur : ${dto.message}`, url: dto.url, digest: dto.digest, userAgent: req.headers['user-agent'] });
    captureClientError(dto.message, { stack: dto.stack, url: dto.url, digest: dto.digest });
  }
}

import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Gives every request an id (kept from X-Request-Id when a proxy sets one, returned in the response
 * header) and logs one line per call: method, path, status, duration, user. 5xx as errors, 4xx as
 * warnings. The id appears in error responses so a user can quote it to support.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request & { id?: string; user?: { userId?: string } }, res: Response, next: NextFunction) {
    const start = Date.now();
    const incoming = req.headers['x-request-id'];
    req.id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    res.on('finish', () => {
      if (req.originalUrl.endsWith('/health')) return;
      const entry = {
        msg: `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - start}ms`,
        requestId: req.id ?? '-',
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Date.now() - start,
        userId: req.user?.userId,
        ip: req.ip?.replace('::ffff:', ''),
      };
      const json = process.env.LOG_FORMAT ? process.env.LOG_FORMAT === 'json' : process.env.NODE_ENV === 'production';
      const payload = json ? entry : `${entry.msg}${entry.userId ? ` user=${entry.userId}` : ''} id=${entry.requestId.slice(0, 8)}`;
      if (res.statusCode >= 500) this.logger.error(payload);
      else if (res.statusCode >= 400) this.logger.warn(payload);
      else this.logger.log(payload);
    });
    next();
  }
}

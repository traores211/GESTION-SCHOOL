import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** One line per API call (method, path, status, duration); 5xx as errors, 4xx as warnings. */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    res.on('finish', () => {
      if (req.originalUrl.endsWith('/health')) return;
      const line = `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - start}ms`;
      if (res.statusCode >= 500) this.logger.error(line);
      else if (res.statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });
    next();
  }
}

import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { DomainResolverService, ResolvedHost } from './domain-resolver.service';

declare module 'express-serve-static-core' {
  interface Request {
    /** The incoming hostname mapped to a school (or the platform). Null when unknown. */
    resolvedHost?: ResolvedHost | null;
  }
}

/**
 * Reads the HTTP Host header, maps it to a school via the SchoolDomain table and attaches the
 * result to the request. It never changes a user's school (that stays driven by the JWT), it only
 * exposes the host context so public endpoints and showcase pages render the right branding and
 * controllers can refuse cross-tenant requests coming from a mismatched hostname.
 */
@Injectable()
export class DomainResolverMiddleware implements NestMiddleware {
  constructor(private readonly resolver: DomainResolverService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // When behind a proxy with trust proxy on, Express rewrites req.hostname from X-Forwarded-Host.
    // Fallback to the raw Host header so dev also works.
    const header = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers['host'];
    req.resolvedHost = await this.resolver.resolve(header ?? null);
    next();
  }
}

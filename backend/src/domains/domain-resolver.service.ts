import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../infra/redis.service';

/** The resolved identity of an incoming hostname. `kind` tells how to treat the request. */
export interface ResolvedHost {
  hostname: string;
  /** PLATFORM | SUBDOMAIN | CUSTOM_DOMAIN | CUSTOM_DOMAIN_ALIAS */
  kind: 'PLATFORM' | 'SUBDOMAIN' | 'CUSTOM_DOMAIN' | 'CUSTOM_DOMAIN_ALIAS';
  /** For PLATFORM: null. For school-scoped hosts: the owning school. */
  schoolId: string | null;
  organisationId: string | null;
  /** True when the domain record was found and is ACTIVE. False means PENDING / SUSPENDED / unknown. */
  active: boolean;
  /** For a CUSTOM_DOMAIN_ALIAS, the canonical primary domain the browser should be redirected to. */
  canonicalHostname?: string | null;
}

/** The hostname the HTTP request was addressed to, lower-cased, port stripped, idn-safe. */
export function cleanHostname(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value) return null;
  // Keep only the first host when the header lists several (comma-separated when behind proxies).
  const first = value.split(',')[0].trim();
  // Strip :port
  const noPort = first.replace(/:\d+$/, '');
  // Basic sanity: a hostname has at least one letter, no path, no scheme.
  if (!/^[a-z0-9.-]+$/.test(noPort) || noPort.length > 253) return null;
  return noPort;
}

const CACHE_TTL = 60; // seconds — short on purpose so a status flip propagates quickly.
const CACHE_PREFIX = 'host:';

/**
 * The source of truth for "which school is this request for?" when the request comes from a
 * public endpoint without a logged-in user. For authenticated endpoints the user's school still
 * wins — the resolved host is only used to display the right branding and as a defence against
 * cross-tenant requests from the public showcase.
 */
@Injectable()
export class DomainResolverService {
  private readonly logger = new Logger('DomainResolver');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisService,
  ) {}

  /** The platform's own hostname (the one that serves the SaaS portal, not a school). */
  get platformHostname(): string {
    return (process.env.PLATFORM_HOSTNAME || '').toLowerCase() || this.hostFromUrl(process.env.PUBLIC_URL) || 'localhost';
  }

  /** The hostname suffix under which schools get an automatic subdomain (ecole.<suffix>). */
  get subdomainSuffix(): string {
    return (process.env.PLATFORM_SUBDOMAIN_SUFFIX || '').toLowerCase() || this.platformHostname;
  }

  async resolve(rawHost: string | undefined | null): Promise<ResolvedHost | null> {
    const hostname = cleanHostname(rawHost);
    if (!hostname) return null;

    const cached = await this.cache.get(CACHE_PREFIX + hostname);
    if (cached) {
      try {
        return JSON.parse(cached) as ResolvedHost;
      } catch {
        // Fall through to a fresh resolution.
      }
    }

    const resolved = await this.resolveFresh(hostname);
    if (resolved) {
      await this.cache.set(CACHE_PREFIX + hostname, JSON.stringify(resolved), CACHE_TTL);
    }
    return resolved;
  }

  /** Drop the cache for one hostname. Called on domain CRUD so changes take effect at once. */
  async invalidate(hostname: string | null | undefined) {
    const h = cleanHostname(hostname);
    if (h) await this.cache.del(CACHE_PREFIX + h);
  }

  /**
   * Resolution order:
   *   1. Exact row in `SchoolDomain` (any status): the authoritative mapping.
   *   2. The hostname is the SaaS platform itself → PLATFORM, no school.
   *   3. The hostname is `<slug>.<platform suffix>` → that school by its code or organisation slug.
   *   4. Localhost / IPs during development → PLATFORM.
   *   5. Unknown → null (the request is served by the platform in a limited mode).
   */
  private async resolveFresh(hostname: string): Promise<ResolvedHost | null> {
    // 1. Explicit mapping wins.
    const row = await this.prisma.schoolDomain.findUnique({
      where: { hostname },
      select: {
        hostname: true,
        kind: true,
        status: true,
        schoolId: true,
        organisationId: true,
        school: { select: { id: true, isActive: true, domains: { where: { isPrimary: true, status: 'ACTIVE' }, select: { hostname: true }, take: 1 } } },
      },
    });
    if (row) {
      const canonical = row.school?.domains?.[0]?.hostname ?? null;
      return {
        hostname: row.hostname,
        kind: row.kind as ResolvedHost['kind'],
        schoolId: row.schoolId,
        organisationId: row.organisationId,
        active: row.status === 'ACTIVE' && row.school?.isActive !== false,
        canonicalHostname: canonical && canonical !== row.hostname ? canonical : null,
      };
    }

    // 2. The SaaS portal itself.
    if (hostname === this.platformHostname) {
      return { hostname, kind: 'PLATFORM', schoolId: null, organisationId: null, active: true };
    }

    // 3. Auto subdomain of the platform: <slug>.<suffix>
    const suffix = this.subdomainSuffix;
    if (suffix && hostname.endsWith(`.${suffix}`)) {
      const slug = hostname.slice(0, -1 - suffix.length);
      if (slug && /^[a-z0-9-]+$/.test(slug)) {
        const school = await this.prisma.school.findFirst({
          where: { OR: [{ code: slug.toUpperCase() }, { code: slug }, { organisation: { slug } }] },
          select: { id: true, organisationId: true, isActive: true },
        });
        if (school) {
          return {
            hostname,
            kind: 'SUBDOMAIN',
            schoolId: school.id,
            organisationId: school.organisationId,
            active: school.isActive,
          };
        }
      }
    }

    // 4. Localhost / loopback / private IPs: treat as the platform during development.
    if (this.isLocal(hostname)) {
      return { hostname, kind: 'PLATFORM', schoolId: null, organisationId: null, active: true };
    }

    // 5. Unknown host: the caller falls back to platform behaviour but the response won't scope anything.
    this.logger.warn(`Unknown hostname: ${hostname}`);
    return null;
  }

  private isLocal(hostname: string): boolean {
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (/^192\.168\./.test(hostname) || /^10\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    return false;
  }

  private hostFromUrl(value: string | undefined): string | null {
    if (!value) return null;
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}

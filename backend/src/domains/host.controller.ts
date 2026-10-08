import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DomainResolverService } from './domain-resolver.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lets a browser (public showcase, login page) know which school a hostname is attached to,
 * without exposing anything beyond the public identity (code, name, logo, status). This is the
 * entry point that lets the frontend render the right branding when a visitor lands on
 * https://mon-ecole-1.ci without yet knowing which tenant that is.
 */
@Controller('public')
@ApiTags('Public Showcase')
export class HostController {
  constructor(
    private readonly resolver: DomainResolverService,
    private readonly prisma: PrismaService,
  ) {}

  /** The tenant of the hostname that received this request. */
  @Get('host')
  async whoAmI(@Req() req: Request) {
    const resolved = req.resolvedHost ?? (await this.resolver.resolve((req.headers['x-forwarded-host'] as string | undefined) ?? req.headers['host']));
    if (!resolved) {
      return { kind: 'UNKNOWN', hostname: null, school: null, platformHostname: this.resolver.platformHostname };
    }
    if (resolved.kind === 'PLATFORM' || !resolved.schoolId) {
      return { kind: 'PLATFORM', hostname: resolved.hostname, school: null, platformHostname: this.resolver.platformHostname };
    }
    const school = await this.prisma.school.findUnique({
      where: { id: resolved.schoolId },
      select: { id: true, name: true, code: true, logoUrl: true, tagline: true, isActive: true, organisationId: true },
    });
    return {
      kind: resolved.kind,
      hostname: resolved.hostname,
      active: resolved.active,
      canonicalHostname: resolved.canonicalHostname,
      school: school
        ? {
            id: school.id,
            name: school.name,
            code: school.code,
            logoUrl: school.logoUrl,
            tagline: school.tagline,
            isActive: school.isActive,
          }
        : null,
      platformHostname: this.resolver.platformHostname,
    };
  }
}

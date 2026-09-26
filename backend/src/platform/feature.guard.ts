import { CanActivate, ExecutionContext, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { Feature, isFeatureEnabled } from './features';

export const FEATURE_KEY = 'platform:feature';

/** Route (or controller) available only when the feature is enabled for the caller's school. */
export const RequireFeature = (feature: Feature) => SetMetadata(FEATURE_KEY, feature);

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<Feature>(FEATURE_KEY, [context.getHandler(), context.getClass()]);
    if (!feature) return true;
    const schoolId = context.switchToHttp().getRequest().user?.schoolId;
    const school = schoolId
      ? await this.prisma.school.findUnique({ where: { id: schoolId }, select: { plan: true, featureOverrides: true } })
      : null;
    if (!isFeatureEnabled(school, feature)) throw new NotFoundException();
    return true;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { permissionsForRole } from '../authz/permissions';
import { enabledFeatures } from '../platform/features';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Profile + what the UI needs to adapt itself: permissions (to hide actions the server would
   * refuse anyway), enabled features of the school's plan, and the school's branding.
   */
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        lastLogin: true,
        mfaEnabled: true,
        school: {
          select: {
            id: true,
            name: true,
            code: true,
            plan: true,
            featureOverrides: true,
            logoUrl: true,
            primaryColor: true,
            secondaryColor: true,
            fontFamily: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException();
    const { school, ...profile } = user;
    return {
      ...profile,
      permissions: permissionsForRole(user.role),
      features: enabledFeatures(school),
      school: school
        ? {
            id: school.id,
            name: school.name,
            code: school.code,
            plan: school.plan,
            logoUrl: school.logoUrl,
            primaryColor: school.primaryColor,
            secondaryColor: school.secondaryColor,
            fontFamily: school.fontFamily,
          }
        : null,
    };
  }
}

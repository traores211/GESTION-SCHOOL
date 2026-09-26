import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { MessagingService } from '../messaging/messaging.service';
import { DEFAULT_SECTIONS, isReadableOnWhiteText, isSafeUrl } from './branding';
import { UpdateSchoolSettingsDto } from './dto';

const URL_FIELDS = ['website', 'logoUrl', 'faviconUrl', 'signatureUrl', 'stampUrl'] as const;

@Injectable()
export class SchoolSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
  ) {}

  private schoolId(user: AuthUser): string {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  async get(user: AuthUser) {
    const school = await this.prisma.school.findUnique({ where: { id: this.schoolId(user) } });
    if (!school) throw new NotFoundException();
    const { featureOverrides, ...rest } = school;
    return { ...rest, showcaseSections: school.showcaseSections ?? DEFAULT_SECTIONS };
  }

  async update(user: AuthUser, dto: UpdateSchoolSettingsDto) {
    const schoolId = this.schoolId(user);
    this.assertSafe(dto);
    const before = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    const updated = await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        ...dto,
        socialLinks: dto.socialLinks ? (dto.socialLinks as unknown as Prisma.InputJsonValue) : undefined,
        showcaseSections: dto.showcaseSections ? (dto.showcaseSections as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    const changed = Object.keys(dto).filter(
      (k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((dto as Record<string, unknown>)[k]),
    );
    await this.audit.record(user, 'UPDATE', 'SchoolSettings', schoolId, { after: { fields: changed } });
    const { featureOverrides, ...rest } = updated;
    return rest;
  }

  /** URLs must be http(s) or site-relative; brand color must stay readable (WCAG AA). */
  private assertSafe(dto: UpdateSchoolSettingsDto) {
    for (const field of URL_FIELDS) {
      const value = dto[field];
      if (value && !isSafeUrl(value)) throw new BadRequestException(`URL non autorisée pour ${field}`);
    }
    for (const link of Object.values(dto.socialLinks ?? {})) {
      if (link && !/^\+?[\d\s]+$/.test(link) && !isSafeUrl(link)) throw new BadRequestException('Lien de réseau social invalide');
    }
    for (const section of dto.showcaseSections ?? []) {
      for (const item of section.items ?? []) {
        for (const url of [item.imageUrl, item.url]) {
          if (url && !isSafeUrl(url)) throw new BadRequestException('URL non autorisée dans une section de la vitrine');
        }
      }
    }
    if (dto.primaryColor && !isReadableOnWhiteText(dto.primaryColor)) {
      throw new BadRequestException(
        'Couleur principale trop claire : le texte blanc des boutons serait illisible (contraste WCAG AA 4.5:1 requis). Choisissez une teinte plus foncée.',
      );
    }
  }

  auditLogs(user: AuthUser, resource?: string) {
    return this.audit.list(this.schoolId(user), 200, resource);
  }

  outbox(user: AuthUser) {
    return this.messaging.list(this.schoolId(user));
  }

  contactMessages(user: AuthUser) {
    return this.prisma.contactMessage.findMany({
      where: { schoolId: this.schoolId(user) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async markContactHandled(user: AuthUser, id: string) {
    const msg = await this.prisma.contactMessage.findFirst({ where: { id, schoolId: this.schoolId(user) } });
    if (!msg) throw new NotFoundException('Message introuvable');
    return this.prisma.contactMessage.update({ where: { id }, data: { handled: true } });
  }
}

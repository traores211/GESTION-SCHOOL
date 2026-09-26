import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { isFeatureEnabled } from '../platform/features';
import { DEFAULT_SECTIONS } from '../school-settings/branding';
import { ContactMessageDto } from '../school-settings/dto';
import { PublicAdmissionDto } from './dto/public-admission.dto';

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  /** Active school whose showcase is published and enabled by its plan; 404 otherwise. */
  private async publicSchool(code: string) {
    const school = await this.prisma.school.findUnique({ where: { code } });
    if (!school || !school.isActive || !school.showcasePublished || !isFeatureEnabled(school, 'showcase')) {
      throw new NotFoundException('Établissement introuvable');
    }
    return school;
  }

  async getShowcase(code: string) {
    const school = await this.publicSchool(code);
    const [levels, announcements, studentsCount] = await Promise.all([
      this.prisma.class.findMany({ where: { schoolId: school.id }, select: { level: true }, distinct: ['level'] }),
      this.prisma.announcement.findMany({
        where: { schoolId: school.id, isPublished: true },
        orderBy: { publishedAt: 'desc' },
        take: 10,
      }),
      this.prisma.student.count({ where: { schoolId: school.id } }),
    ]);

    return {
      name: school.name,
      code: school.code,
      tagline: school.tagline,
      description: school.description,
      directeur: school.directeur,
      city: school.city,
      address: school.address,
      email: school.email,
      phone: school.phone,
      website: school.website,
      latitude: school.latitude,
      longitude: school.longitude,
      branding: {
        logoUrl: school.logoUrl,
        faviconUrl: school.faviconUrl,
        primaryColor: school.primaryColor,
        secondaryColor: school.secondaryColor,
        fontFamily: school.fontFamily,
        footerText: school.footerText,
      },
      socialLinks: school.socialLinks ?? {},
      seo: { title: school.seoTitle || school.name, description: school.seoDescription || school.tagline || '' },
      sections: (school.showcaseSections as unknown[] | null) ?? DEFAULT_SECTIONS,
      levels: levels.map((c) => c.level),
      studentsCount,
      announcements: announcements.map((a) => ({ id: a.id, title: a.title, content: a.content, publishedAt: a.publishedAt })),
    };
  }

  /** Maps a Host header to a school code: custom domain first, then <code>.PLATFORM_DOMAIN. */
  async resolveHost(host: string) {
    const hostname = host.toLowerCase().split(':')[0];
    const custom = await this.prisma.school.findUnique({ where: { customDomain: hostname }, select: { code: true, plan: true, featureOverrides: true, isActive: true } });
    if (custom?.isActive && isFeatureEnabled(custom, 'showcase.customDomain')) return { code: custom.code };
    const domain = process.env.PLATFORM_DOMAIN?.toLowerCase();
    if (domain && hostname.endsWith(`.${domain}`)) {
      const sub = hostname.slice(0, -(domain.length + 1));
      const school = await this.prisma.school.findFirst({ where: { code: { equals: sub, mode: 'insensitive' }, isActive: true }, select: { code: true } });
      if (school) return { code: school.code };
    }
    throw new NotFoundException();
  }

  async submitAdmission(code: string, dto: PublicAdmissionDto) {
    const school = await this.publicSchool(code);
    if (dto.website) return { success: true, reference: 'ok' }; // honeypot: silently ignored

    const year = await this.prisma.academicYear.findFirst({ where: { schoolId: school.id, isCurrent: true } });
    if (!year) throw new BadRequestException('Les candidatures ne sont pas ouvertes pour le moment');

    const admission = await this.prisma.admission.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender ?? 'M',
      },
    });
    await this.messaging.send(
      school.id,
      'EMAIL',
      dto.email,
      `Bonjour,\n\nNous avons bien reçu la demande de préinscription de ${dto.firstName} ${dto.lastName} pour ${school.name}.\nRéférence : ${admission.id}\nL'établissement reviendra vers vous rapidement.`,
      `Préinscription reçue — ${school.name}`,
    );
    return { success: true, reference: admission.id };
  }

  async submitContact(code: string, dto: ContactMessageDto) {
    const school = await this.publicSchool(code);
    if (dto.website) return { success: true }; // honeypot
    await this.prisma.contactMessage.create({
      data: { schoolId: school.id, name: dto.name, email: dto.email, phone: dto.phone, message: dto.message },
    });
    return { success: true };
  }

  /** Public authenticity check of a generated document: reveals no personal data. */
  async verifyDocument(verificationCode: string) {
    const doc = await this.prisma.generatedDocument.findUnique({
      where: { verificationCode },
      include: { school: { select: { name: true } }, templateVersion: { include: { template: { select: { type: true, name: true } } } } },
    });
    if (!doc) throw new NotFoundException('Document inconnu');
    return {
      authentic: true,
      school: doc.school.name,
      documentType: doc.templateVersion.template.name,
      number: doc.number,
      issuedAt: doc.createdAt,
      contentHash: doc.contentHash,
    };
  }
}

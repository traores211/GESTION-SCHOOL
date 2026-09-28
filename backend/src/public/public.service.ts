import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublicAdmissionDto } from './dto/public-admission.dto';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getShowcase(code: string) {
    const ordered = { orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }] };
    const school = await this.prisma.school.findUnique({
      where: { code },
      include: {
        classes: { where: { academicYear: { isCurrent: true } }, select: { level: true } },
        academicYears: { where: { isCurrent: true }, select: { name: true } },
        announcements: { where: { isPublished: true }, orderBy: { publishedAt: 'desc' }, take: 10 },
        highlights: ordered,
        photos: ordered,
        partners: ordered,
        testimonials: { where: { isPublished: true }, ...ordered },
        _count: { select: { students: true } },
      },
    });
    if (!school || !school.isActive) throw new NotFoundException('Établissement introuvable');

    return {
      name: school.name,
      code: school.code,
      tagline: school.tagline,
      description: school.description,
      city: school.city,
      address: school.address,
      email: school.email,
      phone: school.phone,
      website: school.website,
      logoUrl: school.logoUrl,
      coverImageUrl: school.coverImageUrl,
      foundedYear: school.foundedYear,
      mapUrl: school.mapUrl,
      whatsappNumber: school.whatsappNumber,
      social: {
        facebook: school.facebookUrl,
        instagram: school.instagramUrl,
        linkedin: school.linkedinUrl,
        youtube: school.youtubeUrl,
      },
      academicYear: school.academicYears[0]?.name ?? null,
      levels: [...new Set(school.classes.map((c) => c.level))],
      classesCount: school.classes.length,
      studentsCount: school._count.students,
      highlights: school.highlights.map(({ id, value, label }) => ({ id, value, label })),
      photos: school.photos.map(({ id, url, caption }) => ({ id, url, caption })),
      partners: school.partners.map(({ id, name, logoUrl, website }) => ({ id, name, logoUrl, website })),
      testimonials: school.testimonials.map(({ id, authorName, authorRole, content, photoUrl }) => ({
        id,
        authorName,
        authorRole,
        content,
        photoUrl,
      })),
      announcements: school.announcements.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        imageUrl: a.imageUrl,
        publishedAt: a.publishedAt,
      })),
    };
  }

  async submitAdmission(code: string, dto: PublicAdmissionDto) {
    const school = await this.prisma.school.findUnique({ where: { code } });
    if (!school || !school.isActive) throw new NotFoundException('Établissement introuvable');

    const year = await this.prisma.academicYear.findFirst({ where: { schoolId: school.id, isCurrent: true } });
    if (!year) throw new BadRequestException("Les candidatures ne sont pas ouvertes pour le moment");

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

    return { success: true, reference: admission.id };
  }
}

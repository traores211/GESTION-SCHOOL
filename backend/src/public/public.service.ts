import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublicAdmissionDto } from './dto/public-admission.dto';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getShowcase(code: string) {
    const school = await this.prisma.school.findUnique({
      where: { code },
      include: {
        classes: { select: { level: true }, distinct: ['level'] },
        announcements: { where: { isPublished: true }, orderBy: { publishedAt: 'desc' }, take: 10 },
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
      levels: school.classes.map((c) => c.level),
      studentsCount: school._count.students,
      announcements: school.announcements.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
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

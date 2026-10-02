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
        academicYears: {
          where: { isCurrent: true },
          select: { id: true, name: true, startDate: true, endDate: true, terms: { select: { name: true, order: true, startDate: true, endDate: true }, orderBy: { order: 'asc' } } },
        },
        announcements: { where: { isPublished: true }, orderBy: { publishedAt: 'desc' }, take: 10 },
        highlights: ordered,
        photos: ordered,
        partners: ordered,
        testimonials: { where: { isPublished: true }, ...ordered },
        _count: { select: { students: true } },
      },
    });
    if (!school || !school.isActive) throw new NotFoundException('Établissement introuvable');

    const year = school.academicYears[0];
    const [fees, programs] = year ? await Promise.all([this.feesByLevel(school.id, year.id), this.programsByLevel(school.id, year.id)]) : [[], []];

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
      academicYear: year?.name ?? null,
      calendar: year
        ? { start: year.startDate, end: year.endDate, terms: year.terms.map(({ name, order, startDate, endDate }) => ({ name, order, startDate, endDate })) }
        : null,
      fees,
      programs,
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

  /**
   * Published tuition per level, read from the invoices actually issued this year: for each level, the
   * instalments billed to most of its pupils (label, usual amount, due date). Nothing is shown for a level
   * whose billing has no common pattern.
   */
  private async feesByLevel(schoolId: string, academicYearId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { withdrawalDate: null, class: { schoolId, academicYearId } },
      select: { studentId: true, class: { select: { level: true } } },
    });
    const levelOf = new Map(enrollments.map((e) => [e.studentId, e.class.level]));
    const pupilsPerLevel = new Map<string, number>();
    for (const level of levelOf.values()) pupilsPerLevel.set(level, (pupilsPerLevel.get(level) || 0) + 1);

    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, academicYearId, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      select: { studentId: true, label: true, totalAmount: true, dueDate: true },
    });
    // level -> "label|due" -> { amounts }
    const groups = new Map<string, Map<string, { label: string; dueDate: Date; amounts: Map<number, number>; pupils: number }>>();
    for (const inv of invoices) {
      const level = levelOf.get(inv.studentId);
      if (!level) continue;
      const key = `${inv.label}|${inv.dueDate.toISOString().slice(0, 10)}`;
      const byKey = groups.get(level) || new Map();
      const g = byKey.get(key) || { label: inv.label, dueDate: inv.dueDate, amounts: new Map<number, number>(), pupils: 0 };
      g.amounts.set(inv.totalAmount, (g.amounts.get(inv.totalAmount) || 0) + 1);
      g.pupils += 1;
      byKey.set(key, g);
      groups.set(level, byKey);
    }
    return [...groups.entries()]
      .map(([level, byKey]) => {
        const pupils = pupilsPerLevel.get(level) || 1;
        const instalments = [...byKey.values()]
          .filter((g) => g.pupils / pupils >= 0.5)
          .map((g) => ({
            label: g.label,
            dueDate: g.dueDate,
            amount: [...g.amounts.entries()].sort((a, b) => b[1] - a[1])[0][0],
          }))
          .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
        return { level, annual: instalments.reduce((s, i) => s + i.amount, 0), instalments };
      })
      .filter((f) => f.instalments.length > 0);
  }

  /** Subjects taught at each level this year, with their usual coefficient. */
  private async programsByLevel(schoolId: string, academicYearId: string) {
    const rows = await this.prisma.classSubject.findMany({
      where: { class: { schoolId, academicYearId } },
      select: { coefficient: true, class: { select: { level: true } }, subject: { select: { name: true } } },
    });
    const levels = new Map<string, Map<string, Map<number, number>>>();
    for (const r of rows) {
      const subjects = levels.get(r.class.level) || new Map();
      const coeffs = subjects.get(r.subject.name) || new Map<number, number>();
      coeffs.set(r.coefficient, (coeffs.get(r.coefficient) || 0) + 1);
      subjects.set(r.subject.name, coeffs);
      levels.set(r.class.level, subjects);
    }
    return [...levels.entries()].map(([level, subjects]) => ({
      level,
      subjects: [...subjects.entries()]
        .map(([name, coeffs]) => ({ name, coefficient: [...coeffs.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
        .sort((a, b) => b.coefficient - a.coefficient || a.name.localeCompare(b.name)),
    }));
  }}

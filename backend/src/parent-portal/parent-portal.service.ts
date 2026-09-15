import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';

@Injectable()
export class ParentPortalService {
  constructor(private readonly prisma: PrismaService) {}

  private async getParent(user: AuthUser) {
    const parent = await this.prisma.parent.findUnique({
      where: { userId: user.userId },
      include: { students: true },
    });
    if (!parent) throw new NotFoundException('Aucun profil parent associé à ce compte');
    return parent;
  }

  async children(user: AuthUser) {
    const parent = await this.getParent(user);
    return this.prisma.student.findMany({
      where: { id: { in: parent.students.map((s) => s.id) } },
      include: {
        enrollments: { where: { withdrawalDate: null }, include: { class: true }, take: 1 },
        school: true,
      },
    });
  }

  async childDetail(user: AuthUser, studentId: string) {
    const parent = await this.getParent(user);
    if (!parent.students.some((s) => s.id === studentId)) throw new ForbiddenException();

    return this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        enrollments: { where: { withdrawalDate: null }, include: { class: true }, take: 1 },
        attendance: { orderBy: { date: 'desc' }, take: 30 },
        grades: { include: { subject: true, term: true }, orderBy: { createdAt: 'desc' }, take: 30 },
        invoices: { include: { items: true, payments: true }, orderBy: { createdAt: 'desc' } },
        school: true,
      },
    });
  }
}

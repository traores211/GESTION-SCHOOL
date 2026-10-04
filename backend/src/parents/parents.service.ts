import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { CreateParentDto, GuardianLinkDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { MAX_LIST } from '../common/pagination';

/** Quality of the link deduced from the free text kept on the parent record ("Père", "Mère", "Tuteur"). */
export function relationOf(relationship: string | null | undefined): string {
  const text = (relationship ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (['pere', 'father'].includes(text)) return 'PERE';
  if (['mere', 'mother'].includes(text)) return 'MERE';
  if (['tuteur', 'tutrice', 'guardian'].includes(text)) return 'TUTEUR';
  return 'AUTRE';
}

const LINK_SELECT = { studentId: true, relation: true, isLegalGuardian: true, isEmergencyContact: true, canPickUp: true } as const;

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStudentsInSchool(studentIds: string[], schoolId: string) {
    if (studentIds.length === 0) return;
    const count = await this.prisma.student.count({ where: { id: { in: studentIds }, schoolId } });
    if (count !== studentIds.length) {
      throw new BadRequestException("Un ou plusieurs élèves n'appartiennent pas à votre établissement");
    }
  }

  async create(user: AuthUser, dto: CreateParentDto) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    const { studentIds = [], dateOfBirth, ...data } = dto;
    await this.assertStudentsInSchool(studentIds, user.schoolId);
    const relation = relationOf(dto.relationship);

    return this.prisma.parent.create({
      data: {
        ...data,
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
        students: { connect: studentIds.map((id) => ({ id })) },
        guardianships: { create: studentIds.map((studentId) => ({ studentId, relation })) },
      },
      include: { students: true, guardianships: { select: LINK_SELECT } },
    });
  }

  findAll(user: AuthUser, search?: string) {
    if (!user.schoolId) return [];
    return this.prisma.parent.findMany({
      take: MAX_LIST,
      where: {
        students: { some: { schoolId: user.schoolId } },
        archivedAt: null,
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      // Only the children of this school: a parent of a group may also have children elsewhere
      include: { students: { where: { schoolId: user.schoolId }, select: { id: true, firstName: true, lastName: true, matricule: true } } },
      orderBy: [{ lastName: 'asc' }],
    });
  }

  async findOne(user: AuthUser, id: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { id },
      include: {
        students: { where: { schoolId: user.schoolId ?? '-' }, include: { school: true } },
        guardianships: { where: { student: { schoolId: user.schoolId ?? '-' } }, select: LINK_SELECT },
      },
    });
    if (!parent) throw new NotFoundException('Parent introuvable');
    if (!parent.students.length) throw new ForbiddenException();
    return parent;
  }

  async update(user: AuthUser, id: string, dto: UpdateParentDto) {
    const parent = await this.findOne(user, id);
    const { studentIds, dateOfBirth, ...data } = dto;
    if (studentIds && user.schoolId) {
      await this.assertStudentsInSchool(studentIds, user.schoolId);
    }
    // The list replaces the children of THIS school only: children in another school of the group stay linked.
    const current = parent.students.map((s) => s.id);
    const removed = studentIds ? current.filter((sid) => !studentIds.includes(sid)) : [];
    const added = studentIds ? studentIds.filter((sid) => !current.includes(sid)) : [];
    const relation = relationOf(dto.relationship ?? parent.relationship);
    return this.prisma.$transaction(async (tx) => {
      if (removed.length) await tx.guardianship.deleteMany({ where: { parentId: id, studentId: { in: removed } } });
      if (added.length) await tx.guardianship.createMany({ data: added.map((studentId) => ({ parentId: id, studentId, relation })), skipDuplicates: true });
      return tx.parent.update({
        where: { id },
        data: {
          ...data,
          ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
          ...(studentIds ? { students: { disconnect: removed.map((sid) => ({ id: sid })), connect: added.map((sid) => ({ id: sid })) } } : {}),
        },
        include: { students: { where: { schoolId: user.schoolId ?? '-' } }, guardianships: { where: { student: { schoolId: user.schoolId ?? '-' } }, select: LINK_SELECT } },
      });
    });
  }

  /** Quality of a guardian for one child: relation, legal guardian, emergency contact, allowed to collect the child. */
  async setLink(user: AuthUser, id: string, studentId: string, dto: GuardianLinkDto) {
    const parent = await this.findOne(user, id);
    if (!parent.students.some((s) => s.id === studentId)) throw new NotFoundException("Cet élève n'est pas rattaché à ce parent");
    return this.prisma.guardianship.upsert({
      where: { parentId_studentId: { parentId: id, studentId } },
      create: { parentId: id, studentId, relation: dto.relation ?? relationOf(parent.relationship), ...dto },
      update: dto,
      select: LINK_SELECT,
    });
  }

  /** Archives the parent record (kept for the history of the pupils). */
  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.parent.update({ where: { id }, data: { archivedAt: new Date() } });
    return { success: true, archived: true };
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { MANAGEMENT, OFFICE } from '../common/roles';
import { PageQueryDto, pageArgs, pageResult } from '../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';

export interface HomeworkInput {
  classId: string;
  subjectId?: string;
  title: string;
  description?: string;
  dueDate: string;
}

const HOMEWORK_INCLUDE = { class: { select: { id: true, name: true } }, subject: { select: { id: true, name: true } } } satisfies Prisma.HomeworkInclude;

/**
 * Links between the school and the families beyond marks and invoices: the homework diary of each
 * class and the conversations between a guardian and the office.
 */
@Injectable()
export class FamilyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private school(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  private async authorName(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    return u ? `${u.firstName} ${u.lastName}` : 'Établissement';
  }

  // ---------------------------------------------------------------- homework diary

  async createHomework(user: AuthUser, dto: HomeworkInput) {
    const schoolId = this.school(user);
    const klass = await this.prisma.class.findUnique({ where: { id: dto.classId } });
    if (!klass || klass.schoolId !== schoolId) throw new NotFoundException('Classe introuvable');
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId } });
      if (!subject) throw new NotFoundException('Matière introuvable');
    }
    const dueDate = new Date(dto.dueDate);
    if (dueDate.getTime() < Date.now() - 86400000) throw new BadRequestException("La date de remise est déjà passée");
    return this.prisma.homework.create({
      data: {
        schoolId,
        classId: klass.id,
        subjectId: dto.subjectId || null,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        dueDate,
        createdById: user.userId,
        createdByName: await this.authorName(user.userId),
      },
      include: HOMEWORK_INCLUDE,
    });
  }

  /** Homework of the school (or of one class), the nearest due date first; past work for two weeks. */
  listHomework(user: AuthUser, classId?: string) {
    return this.prisma.homework.findMany({
      where: { schoolId: this.school(user), ...(classId ? { classId } : {}), dueDate: { gte: new Date(Date.now() - 14 * 86400000) } },
      include: HOMEWORK_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 300,
    });
  }

  async removeHomework(user: AuthUser, id: string) {
    const item = await this.prisma.homework.findUnique({ where: { id } });
    if (!item || item.schoolId !== this.school(user)) throw new NotFoundException('Devoir introuvable');
    if (item.createdById !== user.userId && !(MANAGEMENT as readonly string[]).includes(user.role)) throw new ForbiddenException("Seul l'auteur ou la direction peut supprimer ce devoir");
    await this.prisma.homework.delete({ where: { id } });
    return { success: true };
  }

  // ---------------------------------------------------------------- parent side

  private async parent(user: AuthUser) {
    const parent = await this.prisma.parent.findUnique({ where: { userId: user.userId }, include: { students: { select: { id: true, schoolId: true, firstName: true, lastName: true } } } });
    if (!parent) throw new NotFoundException('Aucun profil parent associé à ce compte');
    return parent;
  }

  async homeworkForChild(user: AuthUser, studentId: string) {
    const parent = await this.parent(user);
    if (!parent.students.some((s) => s.id === studentId)) throw new ForbiddenException();
    const enrollment = await this.prisma.enrollment.findFirst({ where: { studentId, withdrawalDate: null, class: { academicYear: { isCurrent: true } } }, select: { classId: true } });
    if (!enrollment) return [];
    const items = await this.prisma.homework.findMany({
      where: { classId: enrollment.classId, dueDate: { gte: new Date(Date.now() - 7 * 86400000) } },
      select: { id: true, title: true, description: true, dueDate: true, createdByName: true, subject: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 100,
    });
    return items.map((h) => ({ ...h, subject: h.subject?.name ?? null }));
  }

  async parentConversations(user: AuthUser) {
    const parent = await this.parent(user);
    return this.prisma.conversation.findMany({
      where: { parentId: parent.id },
      select: { id: true, subject: true, status: true, unreadByParent: true, lastMessageAt: true, student: { select: { firstName: true, lastName: true } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
  }

  /** A guardian writes to the school about one of their children. */
  async openConversation(user: AuthUser, dto: { studentId: string; subject: string; body: string }) {
    const parent = await this.parent(user);
    const student = parent.students.find((s) => s.id === dto.studentId);
    if (!student) throw new ForbiddenException();
    const name = `${parent.firstName} ${parent.lastName}`.trim();
    const conversation = await this.prisma.conversation.create({
      data: {
        schoolId: student.schoolId,
        parentId: parent.id,
        studentId: student.id,
        subject: dto.subject.trim(),
        messages: { create: { fromParent: true, authorId: user.userId, authorName: name, body: dto.body.trim() } },
      },
    });
    const office = await this.prisma.user.findMany({ where: { schoolId: student.schoolId, status: 'ACTIVE', role: { in: [...OFFICE] as never } }, select: { id: true }, take: 20 });
    for (const staff of office) await this.notifications.notify(staff.id, 'Message d’un parent', `${name} (${student.firstName} ${student.lastName}) : ${dto.subject.trim()}`);
    return this.parentConversation(user, conversation.id);
  }

  private async ownedByParent(user: AuthUser, id: string) {
    const parent = await this.parent(user);
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation || conversation.parentId !== parent.id) throw new NotFoundException('Conversation introuvable');
    return { conversation, parent };
  }

  async parentConversation(user: AuthUser, id: string) {
    await this.ownedByParent(user, id);
    const conversation = await this.prisma.conversation.update({
      where: { id },
      data: { unreadByParent: false },
      include: { messages: { orderBy: { createdAt: 'asc' }, select: { id: true, fromParent: true, authorName: true, body: true, createdAt: true } }, student: { select: { firstName: true, lastName: true } } },
    });
    return conversation;
  }

  async parentReply(user: AuthUser, id: string, body: string) {
    const { conversation, parent } = await this.ownedByParent(user, id);
    if (conversation.status === 'CLOSED') throw new BadRequestException('Cette conversation est close : ouvrez-en une nouvelle');
    await this.prisma.conversation.update({
      where: { id },
      data: { unreadBySchool: true, lastMessageAt: new Date(), messages: { create: { fromParent: true, authorId: user.userId, authorName: `${parent.firstName} ${parent.lastName}`.trim(), body: body.trim() } } },
    });
    return this.parentConversation(user, id);
  }

  // ---------------------------------------------------------------- office side

  async conversations(user: AuthUser, page: PageQueryDto, status?: string) {
    const where: Prisma.ConversationWhereInput = {
      schoolId: this.school(user),
      ...(status ? { status } : {}),
      ...(page.q ? { OR: [{ subject: { contains: page.q, mode: 'insensitive' } }, { parent: { lastName: { contains: page.q, mode: 'insensitive' } } }, { student: { lastName: { contains: page.q, mode: 'insensitive' } } }] } : {}),
    };
    const paged = { ...page, page: page.page ?? 1 };
    const [rows, total, unread] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: { parent: { select: { firstName: true, lastName: true, phone: true } }, student: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ unreadBySchool: 'desc' }, { lastMessageAt: 'desc' }],
        ...pageArgs(paged, 25),
      }),
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.count({ where: { schoolId: this.school(user), unreadBySchool: true } }),
    ]);
    return { ...(pageResult(paged, rows, total, 25) as object), unread };
  }

  private async ownedBySchool(user: AuthUser, id: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id }, include: { parent: { select: { userId: true, firstName: true, lastName: true } } } });
    if (!conversation || conversation.schoolId !== this.school(user)) throw new NotFoundException('Conversation introuvable');
    return conversation;
  }

  async conversation(user: AuthUser, id: string) {
    await this.ownedBySchool(user, id);
    return this.prisma.conversation.update({
      where: { id },
      data: { unreadBySchool: false },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, select: { id: true, fromParent: true, authorName: true, body: true, createdAt: true } },
        parent: { select: { firstName: true, lastName: true, phone: true, email: true } },
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async staffReply(user: AuthUser, id: string, body: string) {
    const conversation = await this.ownedBySchool(user, id);
    await this.prisma.conversation.update({
      where: { id },
      data: { status: 'OPEN', unreadByParent: true, unreadBySchool: false, lastMessageAt: new Date(), messages: { create: { fromParent: false, authorId: user.userId, authorName: await this.authorName(user.userId), body: body.trim() } } },
    });
    await this.notifications.notify(conversation.parent.userId, "Réponse de l'établissement", conversation.subject);
    return this.conversation(user, id);
  }

  async closeConversation(user: AuthUser, id: string) {
    await this.ownedBySchool(user, id);
    await this.prisma.conversation.update({ where: { id }, data: { status: 'CLOSED', unreadBySchool: false } });
    return this.conversation(user, id);
  }
}

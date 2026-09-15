import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Internal helper used by other modules (attendance, billing, admissions...) to push a notification. */
  async notify(userId: string | null | undefined, subject: string, message: string, type: string = 'in_app') {
    if (!userId) return null;
    return this.prisma.notification.create({
      data: { userId, subject, message, type },
    });
  }

  findForUser(user: AuthUser, unreadOnly?: boolean) {
    return this.prisma.notification.findMany({
      where: { userId: user.userId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  unreadCount(user: AuthUser) {
    return this.prisma.notification.count({ where: { userId: user.userId, isRead: false } });
  }

  async markRead(user: AuthUser, id: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif) throw new NotFoundException('Notification introuvable');
    if (notif.userId !== user.userId) throw new ForbiddenException();
    return this.prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { userId: user.userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }
}

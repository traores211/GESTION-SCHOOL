import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';

/** What a notification is about; an account may mute a category. */
export const NOTIFICATION_CATEGORIES = ['GATE', 'GRADES', 'DOCUMENTS', 'ATTENDANCE'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Internal helper used by other modules (attendance, billing, admissions...) to push a notification. */
  async notify(userId: string | null | undefined, subject: string, message: string, type: string = 'in_app', category?: NotificationCategory) {
    if (!userId) return null;
    if (category) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
      if (this.muted(user?.notificationPrefs).includes(category)) return null;
    }
    return this.prisma.notification.create({
      data: { userId, subject, message, type },
    });
  }

  private muted(prefs: unknown): string[] {
    const list = (prefs as { muted?: unknown } | null)?.muted;
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string') : [];
  }

  async preferences(user: AuthUser) {
    const row = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { notificationPrefs: true } });
    const muted = this.muted(row?.notificationPrefs);
    return { categories: NOTIFICATION_CATEGORIES.map((category) => ({ category, enabled: !muted.includes(category) })) };
  }

  async setPreferences(user: AuthUser, muted: string[]) {
    const known = NOTIFICATION_CATEGORIES.filter((c) => muted.includes(c));
    await this.prisma.user.update({ where: { id: user.userId }, data: { notificationPrefs: { muted: known } } });
    return this.preferences(user);
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

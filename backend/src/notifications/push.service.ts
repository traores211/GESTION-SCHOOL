import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { VapidKeys, isAllowedEndpoint, pushHeaders, validVapidKeys } from './push-vapid';

const MAX_PER_USER = 10;

/**
 * Push notifications on the devices that asked for them. Enabled when VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY are set (generate them once with `node scripts/generate-vapid.js`). The push
 * carries no content: the device shows a generic message and the person opens the application.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  private readonly subject = process.env.VAPID_SUBJECT || `mailto:${process.env.MAIL_FROM?.match(/<(.+)>/)?.[1] ?? 'no-reply@example.ci'}`;

  private get keys(): VapidKeys | null {
    const keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return validVapidKeys(keys) ? keys : null;
  }

  constructor(private readonly prisma: PrismaService) {}

  config() {
    return { enabled: !!this.keys, publicKey: this.keys?.publicKey ?? null };
  }

  async subscribe(user: AuthUser, endpoint: string) {
    if (!this.keys) throw new BadRequestException("Les notifications sur l'appareil ne sont pas configurées sur ce serveur");
    if (!isAllowedEndpoint(endpoint)) throw new BadRequestException("Cette adresse n'est pas celle d'un service de notification reconnu");
    await this.prisma.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, userId: user.userId }, update: { userId: user.userId, failures: 0 } });
    // The oldest devices are dropped beyond a reasonable number per account
    const extra = await this.prisma.pushSubscription.findMany({ where: { userId: user.userId }, orderBy: { createdAt: 'desc' }, skip: MAX_PER_USER, select: { id: true } });
    if (extra.length) await this.prisma.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
    return { success: true, devices: await this.prisma.pushSubscription.count({ where: { userId: user.userId } }) };
  }

  async unsubscribe(user: AuthUser, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.userId } });
    return { success: true };
  }

  /** Wakes every device of an account; a device that no longer exists is forgotten. Never throws. */
  async wake(userId: string): Promise<number> {
    const keys = this.keys;
    if (!keys) return 0;
    const devices = await this.prisma.pushSubscription.findMany({ where: { userId } });
    let sent = 0;
    for (const device of devices) {
      // Checked again at sending time: the allowed hosts may have been tightened since the subscription
      if (!isAllowedEndpoint(device.endpoint)) {
        await this.prisma.pushSubscription.delete({ where: { id: device.id } }).catch(() => undefined);
        continue;
      }
      try {
        const res = await fetch(device.endpoint, { method: 'POST', headers: pushHeaders(device.endpoint, keys, this.subject), signal: AbortSignal.timeout(8000) });
        if (res.status === 404 || res.status === 410) await this.prisma.pushSubscription.delete({ where: { id: device.id } }).catch(() => undefined);
        else if (res.ok) {
          sent++;
          await this.prisma.pushSubscription.update({ where: { id: device.id }, data: { lastUsedAt: new Date(), failures: 0 } }).catch(() => undefined);
        } else await this.prisma.pushSubscription.update({ where: { id: device.id }, data: { failures: { increment: 1 } } }).catch(() => undefined);
      } catch (err) {
        this.logger.warn(`Envoi impossible : ${(err as Error).message}`);
      }
    }
    return sent;
  }
}

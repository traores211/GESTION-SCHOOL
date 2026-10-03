import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../infra/storage.service';
import { AuthUser } from '../common/current-user.decorator';
import { UpdateShowcaseSettingsDto } from './dto/showcase.dto';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ShowcaseCollection = 'highlights' | 'photos' | 'partners' | 'testimonials';

/** Raster image signatures accepted for upload (SVG is refused: it can carry scripts). */
function detectImageExtension(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

const SETTINGS_SELECT = {
  code: true,
  name: true,
  email: true,
  tagline: true,
  description: true,
  address: true,
  city: true,
  phone: true,
  website: true,
  logoUrl: true,
  coverImageUrl: true,
  foundedYear: true,
  mapUrl: true,
  facebookUrl: true,
  instagramUrl: true,
  linkedinUrl: true,
  youtubeUrl: true,
  whatsappNumber: true,
} as const;

@Injectable()
export class ShowcaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private schoolId(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  /** Prisma delegate for a showcase collection (all share schoolId + order columns). */
  private delegate(collection: ShowcaseCollection): any {
    return {
      highlights: this.prisma.schoolHighlight,
      photos: this.prisma.schoolPhoto,
      partners: this.prisma.schoolPartner,
      testimonials: this.prisma.testimonial,
    }[collection];
  }

  async getSettings(user: AuthUser) {
    const schoolId = this.schoolId(user);
    const orderBy = [{ order: 'asc' as const }, { createdAt: 'asc' as const }];
    const [school, highlights, photos, partners, testimonials] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId }, select: SETTINGS_SELECT }),
      this.prisma.schoolHighlight.findMany({ where: { schoolId }, orderBy }),
      this.prisma.schoolPhoto.findMany({ where: { schoolId }, orderBy }),
      this.prisma.schoolPartner.findMany({ where: { schoolId }, orderBy }),
      this.prisma.testimonial.findMany({ where: { schoolId }, orderBy }),
    ]);
    if (!school) throw new NotFoundException('Établissement introuvable');
    return { school, highlights, photos, partners, testimonials };
  }

  updateSettings(user: AuthUser, dto: UpdateShowcaseSettingsDto) {
    const schoolId = this.schoolId(user);
    return this.prisma.school.update({ where: { id: schoolId }, data: dto, select: SETTINGS_SELECT });
  }

  async create(user: AuthUser, collection: ShowcaseCollection, data: Record<string, unknown>) {
    const schoolId = this.schoolId(user);
    const delegate = this.delegate(collection);
    const order = data.order ?? (await delegate.count({ where: { schoolId } }));
    return delegate.create({ data: { ...data, order, schoolId } });
  }

  async update(user: AuthUser, collection: ShowcaseCollection, id: string, data: Record<string, unknown>) {
    await this.ensureOwned(user, collection, id);
    return this.delegate(collection).update({ where: { id }, data });
  }

  async remove(user: AuthUser, collection: ShowcaseCollection, id: string) {
    await this.ensureOwned(user, collection, id);
    await this.delegate(collection).delete({ where: { id } });
    return { success: true };
  }

  private async ensureOwned(user: AuthUser, collection: ShowcaseCollection, id: string) {
    const existing = await this.delegate(collection).findUnique({ where: { id }, select: { schoolId: true } });
    if (!existing || existing.schoolId !== this.schoolId(user)) throw new NotFoundException('Élément introuvable');
  }

  /** Stores an uploaded image under a random name and returns its public path. */
  async saveUpload(file: { buffer: Buffer; size: number } | undefined) {
    if (!file?.buffer) throw new BadRequestException('Aucun fichier reçu (champ "file")');
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('Image trop lourde (5 Mo maximum)');
    const extension = detectImageExtension(file.buffer);
    if (!extension) throw new BadRequestException('Format non accepté : JPEG, PNG, WebP ou GIF uniquement');

    const filename = `${Date.now()}-${randomBytes(8).toString('hex')}.${extension}`;
    await this.storage.put(filename, file.buffer, `image/${extension === 'jpg' ? 'jpeg' : extension}`, { scan: true });
    return { url: this.storage.publicUrl(filename) };
  }
}

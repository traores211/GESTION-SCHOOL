import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { StorageService } from '../infra/storage.service';
import { RedisService } from '../infra/redis.service';
import { TeacherScopeService } from '../common/teacher-scope.service';
import { detectDocument } from '../admissions/admissions.service';

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const PHOTOS_PREFIX = '.photos';

/** 14-character temporary password that satisfies the password policy (letters and digits). */
function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  return [...randomBytes(14)].map((b, i) => (i % 4 === 3 ? String(b % 10) : alphabet[b % alphabet.length])).join('');
}

/** Identity photo of a pupil and the pupil's own account (student portal). */
@Injectable()
export class StudentExtrasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly scope: TeacherScopeService,
    private readonly cache: RedisService,
  ) {}

  private async student(user: AuthUser, id: string) {
    const student = await this.prisma.student.findFirst({ where: { id, schoolId: user.schoolId ?? '-' } });
    if (!student) throw new NotFoundException('Élève introuvable');
    return student;
  }

  /** The photo is stored privately and served only through the API. */
  async savePhoto(user: AuthUser, id: string, file: { buffer: Buffer; size: number } | undefined) {
    const student = await this.student(user, id);
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier reçu');
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException('Photo trop lourde (3 Mo maximum)');
    const type = detectDocument(file.buffer);
    if (!type || type.ext === 'pdf') throw new BadRequestException('Format non accepté : photo JPEG ou PNG');
    const stored = `${randomUUID()}.${type.ext}`;
    await this.storage.put(`${PHOTOS_PREFIX}/${stored}`, file.buffer, type.mime, { scan: true });
    if (student.photoUrl) await this.storage.remove(`${PHOTOS_PREFIX}/${student.photoUrl}`).catch(() => undefined);
    await this.prisma.student.update({ where: { id }, data: { photoUrl: stored } });
    return { success: true, hasPhoto: true };
  }

  async photo(user: AuthUser, id: string) {
    const student = await this.student(user, id);
    await this.scope.assertStudent(user, id);
    if (!student.photoUrl) throw new NotFoundException("Cet élève n'a pas de photo");
    const buffer = await this.storage.get(`${PHOTOS_PREFIX}/${student.photoUrl}`).catch(() => {
      throw new NotFoundException('La photo est introuvable sur le serveur');
    });
    return { buffer, mime: student.photoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }

  /** Gives the pupil an account of his own; the temporary password is shown once to the office. */
  async createAccount(user: AuthUser, id: string, email: string) {
    const student = await this.student(user, id);
    if (student.archivedAt) throw new BadRequestException('Cet élève est archivé');
    if (student.userId) throw new ConflictException('Cet élève a déjà un compte');
    const address = email.trim().toLowerCase();
    if (await this.prisma.user.findFirst({ where: { email: { equals: address, mode: 'insensitive' } } })) throw new ConflictException('Un compte existe déjà avec cette adresse e-mail');
    const password = temporaryPassword();
    const account = await this.prisma.user.create({
      data: { email: address, password: await bcrypt.hash(password, 12), firstName: student.firstName, lastName: student.lastName, role: 'ELEVE', schoolId: student.schoolId, pupil: { connect: { id } } },
      select: { id: true, email: true },
    });
    return { userId: account.id, email: account.email, temporaryPassword: password };
  }

  /** Closes the pupil's account; his record is untouched. */
  async removeAccount(user: AuthUser, id: string) {
    const student = await this.student(user, id);
    if (!student.userId) throw new NotFoundException("Cet élève n'a pas de compte");
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({ where: { userId: student.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.user.update({ where: { id: student.userId }, data: { status: 'ARCHIVED' } }),
      this.prisma.student.update({ where: { id }, data: { userId: null } }),
    ]);
    // The sign-in state is cached: dropping it cuts the open session at once
    await this.cache.del(`auth:user:${student.userId}`);
    return { success: true };
  }
}

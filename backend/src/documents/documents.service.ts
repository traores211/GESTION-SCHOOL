import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { StorageService } from '../infra/storage.service';
import { TeacherScopeService } from '../common/teacher-scope.service';
import { MANAGEMENT, OFFICE } from '../common/roles';
import { inSchool } from '../platform/group.service';
import { detectDocument } from '../admissions/admissions.service';
import { NotificationsService } from '../notifications/notifications.service';

export const DOCUMENT_CATEGORIES = ['PHOTO', 'BULLETIN', 'ACTE_NAISSANCE', 'CERTIFICAT_SCOLARITE', 'PIECE_IDENTITE', 'CONTRAT', 'DIPLOME', 'ADMINISTRATIF', 'JUSTIFICATIF', 'AUTRE'] as const;
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const FILES_PREFIX = '.documents';

export interface UploadedDocument {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface DocumentInput {
  studentId?: string;
  staffUserId?: string;
  name?: string;
  category?: string;
  visibility?: 'INTERNE' | 'FAMILLE';
  documentDate?: string;
}

const PUBLIC = {
  id: true, name: true, type: true, category: true, fileMime: true, fileSize: true, documentDate: true, version: true, replacesId: true,
  status: true, visibility: true, uploadedByName: true, uploadedAt: true, archivedAt: true, studentId: true, staffId: true,
} as const;

/**
 * Documents of the pupil and staff records. Files are private: stored outside the public uploads,
 * scanned, and only served through the API after the access check of each request.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly scope: TeacherScopeService,
    private readonly notifications: NotificationsService,
  ) {}

  private school(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  private isOffice(user: AuthUser) {
    return (OFFICE as readonly string[]).includes(user.role);
  }

  private isManagement(user: AuthUser) {
    return (MANAGEMENT as readonly string[]).includes(user.role);
  }

  /** Whose record the request is about, after checking the caller may reach it. */
  private async owner(user: AuthUser, target: { studentId?: string; staffUserId?: string }, write: boolean) {
    const schoolId = this.school(user);
    if (!!target.studentId === !!target.staffUserId) throw new BadRequestException("Indiquez l'élève ou le membre du personnel concerné");
    if (target.studentId) {
      if (write && !this.isOffice(user)) throw new ForbiddenException('Seul le secrétariat ou la direction ajoute un document au dossier');
      const student = await this.prisma.student.findUnique({ where: { id: target.studentId }, select: { id: true, schoolId: true } });
      if (!student || student.schoolId !== schoolId) throw new NotFoundException('Élève introuvable');
      await this.scope.assertStudent(user, student.id);
      return { schoolId, studentId: student.id, staffId: null };
    }
    // Staff records hold contracts and identity papers: management only
    if (!this.isManagement(user)) throw new ForbiddenException('Les documents du personnel sont réservés à la direction');
    const staff = await this.prisma.staffMember.findFirst({ where: { userId: target.staffUserId, user: inSchool(schoolId) }, select: { id: true } });
    if (!staff) throw new NotFoundException('Membre du personnel introuvable');
    return { schoolId, studentId: null, staffId: staff.id };
  }

  private async owned(user: AuthUser, id: string, write: boolean) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc || doc.schoolId !== this.school(user) || (!doc.studentId && !doc.staffId)) throw new NotFoundException('Document introuvable');
    if (doc.staffId) {
      if (!this.isManagement(user)) throw new ForbiddenException('Les documents du personnel sont réservés à la direction');
    } else {
      if (write && !this.isOffice(user)) throw new ForbiddenException('Seul le secrétariat ou la direction modifie un document du dossier');
      await this.scope.assertStudent(user, doc.studentId!);
    }
    return doc;
  }

  private async store(file: UploadedDocument | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier reçu');
    if (file.size > MAX_DOCUMENT_BYTES) throw new BadRequestException('Fichier trop lourd (8 Mo maximum)');
    const type = detectDocument(file.buffer);
    if (!type) throw new BadRequestException('Format non accepté : PDF, JPEG ou PNG uniquement');
    const stored = `${randomUUID()}.${type.ext}`;
    await this.storage.put(`${FILES_PREFIX}/${stored}`, file.buffer, type.mime, { scan: true });
    const fileName = file.originalname.replace(/[^\w.\- ()À-ÿ]/g, '_').slice(0, 120) || `document.${type.ext}`;
    return { filePath: stored, fileMime: type.mime, fileSize: file.size, type: type.ext === 'pdf' ? 'PDF' : 'IMAGE', fileName };
  }

  private async author(user: AuthUser) {
    const u = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } });
    return u ? `${u.firstName} ${u.lastName}` : null;
  }

  async list(user: AuthUser, target: { studentId?: string; staffUserId?: string }, archived = false) {
    const owner = await this.owner(user, target, false);
    return this.prisma.document.findMany({
      where: {
        schoolId: owner.schoolId,
        ...(owner.studentId ? { studentId: owner.studentId } : { staffId: owner.staffId }),
        status: archived ? 'ARCHIVE' : 'ACTIF',
        // Teachers read what the family also sees; internal papers stay with the office
        ...(this.isOffice(user) || owner.staffId ? {} : { visibility: 'FAMILLE' }),
      },
      select: PUBLIC,
      orderBy: [{ category: 'asc' }, { uploadedAt: 'desc' }],
      take: 500,
    });
  }

  async upload(user: AuthUser, dto: DocumentInput, file: UploadedDocument | undefined) {
    const owner = await this.owner(user, dto, true);
    const stored = await this.store(file);
    const { fileName, ...data } = stored;
    const created = await this.prisma.document.create({
      data: {
        ...data,
        ...owner,
        name: dto.name?.trim() || fileName,
        category: dto.category ?? 'AUTRE',
        visibility: owner.staffId ? 'INTERNE' : (dto.visibility ?? 'INTERNE'),
        documentDate: dto.documentDate ? new Date(dto.documentDate) : null,
        uploadedById: user.userId,
        uploadedByName: await this.author(user),
      },
      select: PUBLIC,
    });
    if (created.studentId && created.visibility === 'FAMILLE') await this.tellFamily(created.studentId, created.name).catch(() => undefined);
    return created;
  }

  /** The guardians who have an account are told that a document is available for their child. */
  private async tellFamily(studentId: string, name: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId }, select: { firstName: true, parents: { where: { archivedAt: null, userId: { not: null } }, select: { userId: true } } } });
    for (const parent of student?.parents ?? []) await this.notifications.notify(parent.userId, 'Document disponible', `Un document est disponible pour ${student!.firstName} : ${name}.`, 'in_app', 'DOCUMENTS');
  }

  /** A new version: the former file is archived, not lost. */
  async replace(user: AuthUser, id: string, file: UploadedDocument | undefined) {
    const previous = await this.owned(user, id, true);
    if (previous.status !== 'ACTIF') throw new BadRequestException('Ce document est archivé : restaurez-le avant de le remplacer');
    const stored = await this.store(file);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fileName, ...data } = stored;
    const author = await this.author(user);
    return this.prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { status: 'ARCHIVE', archivedAt: new Date() } });
      return tx.document.create({
        data: {
          ...data,
          schoolId: previous.schoolId,
          studentId: previous.studentId,
          staffId: previous.staffId,
          name: previous.name,
          category: previous.category,
          visibility: previous.visibility,
          documentDate: previous.documentDate,
          version: previous.version + 1,
          replacesId: previous.id,
          uploadedById: user.userId,
          uploadedByName: author,
        },
        select: PUBLIC,
      });
    });
  }

  async update(user: AuthUser, id: string, dto: { name?: string; category?: string; visibility?: 'INTERNE' | 'FAMILLE'; status?: 'ACTIF' | 'ARCHIVE'; documentDate?: string }) {
    const doc = await this.owned(user, id, true);
    return this.prisma.document.update({
      where: { id },
      data: {
        ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.visibility && !doc.staffId ? { visibility: dto.visibility } : {}),
        ...(dto.documentDate ? { documentDate: new Date(dto.documentDate) } : {}),
        ...(dto.status ? { status: dto.status, archivedAt: dto.status === 'ARCHIVE' ? new Date() : null } : {}),
      },
      select: PUBLIC,
    });
  }

  private async read(doc: { filePath: string | null; fileMime: string | null; name: string }) {
    if (!doc.filePath) throw new NotFoundException("Ce document n'a pas de fichier");
    const buffer = await this.storage.get(`${FILES_PREFIX}/${doc.filePath}`).catch(() => {
      throw new NotFoundException('Le fichier est introuvable sur le serveur');
    });
    const ext = doc.filePath.split('.').pop();
    return { buffer, mime: doc.fileMime ?? 'application/octet-stream', fileName: /\.\w{2,4}$/.test(doc.name) ? doc.name : `${doc.name}.${ext}` };
  }

  async file(user: AuthUser, id: string) {
    const doc = await this.owned(user, id, false);
    if (!doc.staffId && !this.isOffice(user) && doc.visibility !== 'FAMILLE') throw new ForbiddenException('Ce document est réservé au secrétariat');
    return this.read(doc);
  }

  /** Definitive removal, for the management only and only once the document is archived. */
  async remove(user: AuthUser, id: string) {
    const doc = await this.owned(user, id, true);
    if (!this.isManagement(user)) throw new ForbiddenException('Seule la direction supprime définitivement un document');
    if (doc.status !== 'ARCHIVE') throw new BadRequestException("Archivez d'abord ce document : seul un document archivé peut être supprimé");
    await this.prisma.document.delete({ where: { id } });
    if (doc.filePath) await this.storage.remove(`${FILES_PREFIX}/${doc.filePath}`).catch(() => undefined);
    return { success: true };
  }

  // ---------------------------------------------------------------- families

  private async childOf(user: AuthUser, studentId: string) {
    // A guardian of the child, or the pupil himself
    const link = user.role === 'ELEVE'
      ? await this.prisma.student.findFirst({ where: { id: studentId, userId: user.userId }, select: { id: true } })
      : await this.prisma.parent.findFirst({ where: { userId: user.userId, archivedAt: null, students: { some: { id: studentId } } }, select: { id: true } });
    if (!link) throw new ForbiddenException();
  }

  /** What the school shares with the family: active documents marked "FAMILLE" of the guardian's own child. */
  async forFamily(user: AuthUser, studentId: string) {
    await this.childOf(user, studentId);
    return this.prisma.document.findMany({
      where: { studentId, status: 'ACTIF', visibility: 'FAMILLE' },
      select: { id: true, name: true, type: true, category: true, documentDate: true, uploadedAt: true, fileSize: true },
      orderBy: { uploadedAt: 'desc' },
      take: 200,
    });
  }

  async familyFile(user: AuthUser, studentId: string, id: string) {
    await this.childOf(user, studentId);
    const doc = await this.prisma.document.findFirst({ where: { id, studentId, status: 'ACTIF', visibility: 'FAMILLE' } });
    if (!doc) throw new NotFoundException('Document introuvable');
    return this.read(doc);
  }
}

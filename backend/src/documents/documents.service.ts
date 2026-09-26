import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { SequenceService } from '../common/sequence.service';
import { PUBLIC_USER_SELECT } from '../common/user-select';
import { DEFAULT_TEMPLATES, printLayout } from './default-templates';
import { allowedKeys, analyzeTemplate, applyMappings, render, sanitizeTemplate, VARIABLES } from './template-engine';

const CONTEXTS = ['STUDENT', 'STAFF', 'SCHOOL'];
const fmtDate = (d?: Date | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
const fmtMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequenceService,
  ) {}

  private sid(user: AuthUser) {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    return user.schoolId;
  }

  variables(context: string) {
    return { context, variables: [...VARIABLES.COMMON, ...(VARIABLES[context] ?? [])] };
  }

  /** Lists templates; seeds the default ones the first time a school opens the module. */
  async templates(user: AuthUser) {
    const schoolId = this.sid(user);
    if ((await this.prisma.documentTemplate.count({ where: { schoolId } })) === 0) {
      for (const t of DEFAULT_TEMPLATES) {
        await this.prisma.documentTemplate.create({
          data: { schoolId, type: t.type, name: t.name, context: t.context, versions: { create: { version: 1, content: t.content } } },
        });
      }
    }
    return this.prisma.documentTemplate.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
  }

  private async ownTemplate(user: AuthUser, id: string) {
    const t = await this.prisma.documentTemplate.findFirst({
      where: { id, schoolId: this.sid(user) },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!t) throw new NotFoundException('Modèle introuvable');
    return t;
  }

  template(user: AuthUser, id: string) {
    return this.ownTemplate(user, id);
  }

  async createTemplate(user: AuthUser, dto: { name: string; type: string; context: string; content: string }) {
    if (!CONTEXTS.includes(dto.context)) throw new BadRequestException('Contexte invalide');
    const content = sanitizeTemplate(dto.content);
    const t = await this.prisma.documentTemplate.create({
      data: {
        schoolId: this.sid(user),
        name: dto.name,
        type: dto.type,
        context: dto.context,
        versions: { create: { version: 1, content, createdById: user.userId } },
      },
    });
    await this.audit.record(user, 'CREATE', 'DocumentTemplate', t.id);
    return { ...t, analysis: analyzeTemplate(content, dto.context) };
  }

  /** Every save creates a new version; generated documents keep pointing to the version used. */
  async saveVersion(user: AuthUser, id: string, content: string) {
    const t = await this.ownTemplate(user, id);
    const clean = sanitizeTemplate(content);
    const version = t.currentVersion + 1;
    await this.prisma.$transaction([
      this.prisma.documentTemplateVersion.create({ data: { templateId: id, version, content: clean, createdById: user.userId } }),
      this.prisma.documentTemplate.update({ where: { id }, data: { currentVersion: version } }),
    ]);
    await this.audit.record(user, 'NEW_VERSION', 'DocumentTemplate', id, { after: { version } });
    return { version, analysis: analyzeTemplate(clean, t.context) };
  }

  analyze(content: string, context: string) {
    return analyzeTemplate(sanitizeTemplate(content), context);
  }

  applyMappings(content: string, mappings: { placeholder: string; variable: string }[], context: string) {
    const allowed = allowedKeys(context);
    const bad = mappings.filter((m) => !allowed.includes(m.variable));
    if (bad.length) throw new BadRequestException(`Variables inconnues : ${bad.map((b) => b.variable).join(', ')}`);
    const out = applyMappings(sanitizeTemplate(content), mappings);
    return { content: out, analysis: analyzeTemplate(out, context) };
  }

  /** Data dictionary filled for one subject — always scoped to the caller's school. */
  private async dataFor(user: AuthUser, context: string, subjectId?: string) {
    const schoolId = this.sid(user);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
    const data: Record<string, unknown> = {
      school: {
        name: school.name,
        address: school.address ?? '',
        city: school.city ?? '',
        phone: school.phone ?? '',
        email: school.email,
        directeur: school.directeur ?? '',
        logoUrl: school.logoUrl ?? '',
      },
      academicYear: year?.name ?? '',
      today: fmtDate(new Date()),
    };
    if (context === 'STUDENT') {
      if (!subjectId) throw new BadRequestException('Élève requis');
      const student = await this.prisma.student.findFirst({
        where: { id: subjectId, schoolId },
        include: {
          enrollments: { where: { withdrawalDate: null }, include: { class: true }, take: 1 },
          invoices: { include: { payments: { where: { status: 'SUCCESS' } } } },
        },
      });
      if (!student) throw new NotFoundException('Élève introuvable');
      const invoiced = student.invoices.filter((i) => i.status !== 'CANCELLED').reduce((s, i) => s + i.totalAmount, 0);
      const paid = student.invoices.reduce((s, i) => s + i.payments.reduce((a, p) => a + p.amount, 0), 0);
      data.student = {
        firstName: student.firstName,
        lastName: student.lastName,
        matricule: student.matricule,
        dateOfBirth: fmtDate(student.dateOfBirth),
        placeOfBirth: student.placeOfBirth ?? '',
        gender: student.gender === 'F' ? 'Féminin' : 'Masculin',
        nationality: student.nationality ?? '',
      };
      const klass = student.enrollments[0]?.class;
      data.class = { name: klass?.name ?? '', level: klass?.level ?? '' };
      data.balance = { remaining: fmtMoney(invoiced - paid) };
    } else if (context === 'STAFF') {
      if (!subjectId) throw new BadRequestException('Membre du personnel requis');
      const staff = await this.prisma.staffMember.findFirst({ where: { id: subjectId, user: { schoolId } }, include: { user: { select: PUBLIC_USER_SELECT } } });
      if (!staff) throw new NotFoundException('Membre du personnel introuvable');
      data.staff = { firstName: staff.user.firstName, lastName: staff.user.lastName, position: staff.position, hireDate: fmtDate(staff.hireDate) };
    }
    return { school, data };
  }

  private async assemble(user: AuthUser, content: string, context: string, subjectId: string | undefined, number: string, verificationCode: string) {
    const { school, data } = await this.dataFor(user, context, subjectId);
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verifier/${verificationCode}`;
    data.document = { number, verificationUrl };
    const { html: body, missing } = render(sanitizeTemplate(content), data);
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 0, width: 160 });
    const html = printLayout({
      body,
      schoolName: school.name,
      logoUrl: school.logoUrl,
      address: [school.address, school.city, school.phone].filter(Boolean).join(' · '),
      footerText: school.footerText,
      signatureUrl: school.signatureUrl,
      stampUrl: school.stampUrl,
      qrDataUrl,
      number,
      verificationUrl,
      primaryColor: school.primaryColor,
    });
    return { html, missing };
  }

  /** Preview: nothing stored, number not consumed. */
  async preview(user: AuthUser, templateId: string, subjectId?: string, content?: string) {
    const t = await this.ownTemplate(user, templateId);
    return this.assemble(user, content ?? t.versions[0].content, t.context, subjectId, 'APERÇU', 'apercu');
  }

  async generate(user: AuthUser, templateId: string, subjectId?: string) {
    const schoolId = this.sid(user);
    const t = await this.ownTemplate(user, templateId);
    const version = t.versions[0];
    const number = await this.sequences.documentNumber(schoolId);
    const verificationCode = randomBytes(12).toString('base64url');
    const { html, missing } = await this.assemble(user, version.content, t.context, subjectId, number, verificationCode);
    const doc = await this.prisma.generatedDocument.create({
      data: {
        schoolId,
        templateVersionId: version.id,
        subjectId,
        number,
        verificationCode,
        html,
        contentHash: createHash('sha256').update(html).digest('hex'),
        createdById: user.userId,
      },
      select: { id: true, number: true, verificationCode: true, createdAt: true },
    });
    await this.audit.record(user, 'GENERATE', 'Document', doc.id, { after: { template: t.name, version: version.version, number } });
    return { ...doc, missing };
  }

  history(user: AuthUser, subjectId?: string) {
    return this.prisma.generatedDocument.findMany({
      where: { schoolId: this.sid(user), ...(subjectId ? { subjectId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        number: true,
        subjectId: true,
        createdAt: true,
        verificationCode: true,
        templateVersion: { select: { version: true, template: { select: { name: true } } } },
      },
    });
  }

  async html(user: AuthUser, id: string) {
    const doc = await this.prisma.generatedDocument.findFirst({ where: { id, schoolId: this.sid(user) }, select: { html: true } });
    if (!doc) throw new NotFoundException('Document introuvable');
    return doc.html;
  }
}

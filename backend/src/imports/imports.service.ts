import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherScopeService } from '../common/teacher-scope.service';
import { AuthUser } from '../common/current-user.decorator';
import { SequenceService } from '../infra/sequence.service';
import { normalizePhone } from '../infra/sms';
import { UnsupportedFileError, detectFileKind } from '../timetable/import/file-type';
import { CsvParser } from '../timetable/import/parsers/csv.parser';
import { XlsxParser } from '../timetable/import/parsers/xlsx.parser';
import { IMPORT_SPECS, ImportKind, isEmail, key, mapHeaders, parseAmount, parseDate, parseGender, parseGradeType, parseRole, parseScore, personKey, readRows } from './import-rules';

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

type Values = Record<string, string>;

interface Prepared {
  line: number;
  /** What the row is about, for the report ("KONÉ Awa", "2026-0001 · 75 000 FCFA"). */
  label: string;
  status: 'ok' | 'error' | 'skipped';
  messages: string[];
  /** Writes the row; only called for "ok" rows when the import is confirmed. */
  write?: () => Promise<void>;
}

export interface ImportReport {
  kind: ImportKind;
  committed: boolean;
  total: number;
  ok: number;
  errors: number;
  skipped: number;
  /** Rows actually written (confirmed import only). */
  imported: number;
  recognised: string[];
  ignoredColumns: string[];
  rows: { line: number; label: string; status: string; messages: string[] }[];
}

/**
 * Bulk imports from Excel or CSV. The same file is first analysed (nothing written: every row gets
 * a status and its problems), then sent again with `commit` to write the valid rows. Rows already
 * present are skipped, so importing the same file twice is harmless.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly scope: TeacherScopeService,
  ) {}

  private async table(file: { buffer: Buffer; originalname: string; size: number } | undefined): Promise<string[][]> {
    if (!file?.buffer?.length) throw new BadRequestException('Aucun fichier reçu');
    if (file.size > MAX_IMPORT_FILE_BYTES) throw new BadRequestException('Fichier trop lourd (5 Mo maximum)');
    let detected;
    try {
      detected = detectFileKind(file.buffer, file.originalname);
    } catch (err) {
      throw new BadRequestException(err instanceof UnsupportedFileError ? err.message : 'Fichier illisible');
    }
    if (detected.kind !== 'csv' && detected.kind !== 'xlsx' && detected.kind !== 'text') {
      throw new BadRequestException(`Format non pris en charge (${detected.label}) : envoyez un fichier Excel (.xlsx) ou CSV`);
    }
    const parser = detected.kind === 'xlsx' ? new XlsxParser() : new CsvParser();
    const document = await parser.parse(file.buffer, detected.kind === 'text' ? { ...detected, kind: 'csv' } : detected).catch(() => {
      throw new BadRequestException("Le fichier n'a pas pu être lu : vérifiez qu'il n'est pas protégé par un mot de passe");
    });
    const rows = document.tables[0]?.rows ?? [];
    if (rows.length < 2) throw new BadRequestException("Le fichier ne contient aucune ligne de données sous la ligne d'en-tête");
    if (rows.length - 1 > MAX_IMPORT_ROWS) throw new BadRequestException(`Trop de lignes (${rows.length - 1}) : ${MAX_IMPORT_ROWS} au maximum par fichier`);
    return rows;
  }

  async run(user: AuthUser, kind: ImportKind, file: { buffer: Buffer; originalname: string; size: number } | undefined, commit: boolean): Promise<ImportReport> {
    if (!user.schoolId) throw new BadRequestException("L'utilisateur n'est rattaché à aucun établissement");
    const spec = IMPORT_SPECS[kind];
    const table = await this.table(file);
    const mapping = mapHeaders(table[0], spec.columns);
    if (mapping.missing.length) {
      throw new BadRequestException(`Colonne(s) obligatoire(s) introuvable(s) : ${mapping.missing.join(', ')}. Téléchargez le modèle pour voir les en-têtes attendus.`);
    }
    const rows = readRows(table, mapping).filter((r) => Object.values(r.values).some((v) => v !== ''));
    const prepared = await this[kind](user, user.schoolId, rows);

    let imported = 0;
    if (commit) {
      for (const row of prepared) {
        if (row.status !== 'ok' || !row.write) continue;
        try {
          await row.write();
          imported++;
        } catch (err) {
          row.status = 'error';
          row.messages.push(`Écriture impossible : ${(err as Error).message.split('\n').pop()?.slice(0, 160)}`);
        }
      }
    }
    const count = (status: string) => prepared.filter((r) => r.status === status).length;
    // Problems first: they are what the office has to fix.
    const order = { error: 0, skipped: 1, ok: 2 };
    return {
      kind,
      committed: commit,
      total: prepared.length,
      ok: count('ok'),
      errors: count('error'),
      skipped: count('skipped'),
      imported,
      recognised: spec.columns.filter((c) => mapping.columns[c.field] !== undefined).map((c) => c.header),
      ignoredColumns: mapping.ignored,
      rows: prepared
        .map(({ line, label, status, messages }) => ({ line, label, status, messages }))
        .sort((a, b) => order[a.status as keyof typeof order] - order[b.status as keyof typeof order] || a.line - b.line)
        .slice(0, 300),
    };
  }

  private async currentYear(schoolId: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, include: { terms: true } });
    if (!year) throw new BadRequestException("Aucune année scolaire courante n'est configurée");
    return year;
  }

  // ---------------------------------------------------------------- pupils and guardians

  private async students(_user: AuthUser, schoolId: string, rows: { line: number; values: Values }[]): Promise<Prepared[]> {
    const year = await this.currentYear(schoolId);
    const [classes, existing, parents] = await Promise.all([
      this.prisma.class.findMany({ where: { schoolId, academicYearId: year.id }, select: { id: true, name: true, code: true } }),
      this.prisma.student.findMany({ where: { schoolId, anonymizedAt: null }, select: { firstName: true, lastName: true, dateOfBirth: true, matricule: true } }),
      this.prisma.parent.findMany({ where: { archivedAt: null, students: { some: { schoolId } } }, select: { id: true, phone: true } }),
    ]);
    const classByKey = new Map<string, string>();
    for (const c of classes) {
      classByKey.set(key(c.name), c.id);
      classByKey.set(key(c.code), c.id);
    }
    const known = new Set(existing.map((s) => personKey(s.lastName, s.firstName, s.dateOfBirth)));
    const matricules = new Set((await this.prisma.student.findMany({ select: { matricule: true } })).map((s) => s.matricule));
    const parentByPhone = new Map<string, string>();
    for (const p of parents) {
      const phone = normalizePhone(p.phone);
      if (phone) parentByPhone.set(phone, p.id);
    }
    const now = new Date();

    return rows.map(({ line, values: v }) => {
      const messages: string[] = [];
      const dateOfBirth = parseDate(v.dateOfBirth ?? '');
      const gender = parseGender(v.gender ?? '');
      if (!v.lastName) messages.push('Nom manquant');
      if (!v.firstName) messages.push('Prénom manquant');
      if (!dateOfBirth) messages.push(v.dateOfBirth ? `Date de naissance illisible : « ${v.dateOfBirth} » (attendu : jj/mm/aaaa)` : 'Date de naissance manquante');
      else if (dateOfBirth > now || now.getFullYear() - dateOfBirth.getUTCFullYear() > 30) messages.push(`Date de naissance invraisemblable : ${v.dateOfBirth}`);
      if (!gender) messages.push(v.gender ? `Sexe non reconnu : « ${v.gender} » (M ou F)` : 'Sexe manquant');
      const classId = v.className ? classByKey.get(key(v.className)) : undefined;
      if (v.className && !classId) messages.push(`Classe « ${v.className} » introuvable pour ${year.name}`);
      if (v.matricule && matricules.has(v.matricule)) messages.push(`Matricule ${v.matricule} déjà utilisé`);
      const hasGuardian = !!(v.guardianLastName || v.guardianFirstName || v.guardianPhone || v.guardianEmail);
      const guardianPhone = normalizePhone(v.guardianPhone);
      if (v.guardianPhone && !guardianPhone) messages.push(`Téléphone du responsable invalide : « ${v.guardianPhone} »`);
      if (v.guardianEmail && !isEmail(v.guardianEmail)) messages.push(`E-mail du responsable invalide : « ${v.guardianEmail} »`);
      if (hasGuardian && !guardianPhone && !v.guardianLastName) messages.push('Responsable : indiquez au moins son nom ou son téléphone');

      const label = `${v.lastName} ${v.firstName}`.trim() || `Ligne ${line}`;
      if (messages.length) return { line, label, status: 'error', messages };
      const identity = personKey(v.lastName, v.firstName, dateOfBirth);
      if (known.has(identity)) return { line, label, status: 'skipped', messages: ["Déjà présent dans l'établissement (même nom, prénom et date de naissance)"] };
      known.add(identity);
      if (v.matricule) matricules.add(v.matricule);

      return {
        line,
        label,
        status: 'ok',
        messages: [],
        write: async () => {
          await this.prisma.$transaction(async (tx) => {
            const student = await tx.student.create({
              data: {
                schoolId,
                firstName: v.firstName,
                lastName: v.lastName,
                dateOfBirth: dateOfBirth!,
                gender: gender!,
                matricule: v.matricule || (await this.sequences.matricule(tx)),
                placeOfBirth: v.placeOfBirth || null,
                nationality: v.nationality || null,
                address: v.address || null,
                ...(classId ? { enrollments: { create: { classId } } } : {}),
              },
            });
            if (!hasGuardian) return;
            const existingParent = guardianPhone ? parentByPhone.get(guardianPhone) : undefined;
            if (existingParent) {
              // Same phone number: brothers and sisters share the guardian record.
              await tx.parent.update({ where: { id: existingParent }, data: { students: { connect: { id: student.id } } } });
              return;
            }
            const parent = await tx.parent.create({
              data: {
                firstName: v.guardianFirstName || '',
                lastName: v.guardianLastName || v.lastName,
                email: v.guardianEmail?.toLowerCase() || '',
                phone: guardianPhone ?? '',
                relationship: v.guardianRelation || 'Tuteur',
                students: { connect: { id: student.id } },
              },
            });
            if (guardianPhone) parentByPhone.set(guardianPhone, parent.id);
          });
        },
      };
    });
  }

  // ---------------------------------------------------------------- staff

  private async staff(_user: AuthUser, schoolId: string, rows: { line: number; values: Values }[]): Promise<Prepared[]> {
    const emails = new Set((await this.prisma.user.findMany({ select: { email: true } })).map((u) => u.email.toLowerCase()));
    // Nobody knows this password: each person sets their own with "Mot de passe oublié".
    let passwordHash: string | null = null;

    return rows.map(({ line, values: v }) => {
      const messages: string[] = [];
      const email = (v.email ?? '').toLowerCase();
      const role = parseRole(v.role ?? '');
      const hireDate = v.hireDate ? parseDate(v.hireDate) : new Date();
      const baseSalary = v.baseSalary ? parseAmount(v.baseSalary) : null;
      if (!v.lastName) messages.push('Nom manquant');
      if (!v.firstName) messages.push('Prénom manquant');
      if (!email) messages.push('E-mail manquant');
      else if (!isEmail(email)) messages.push(`E-mail invalide : « ${v.email} »`);
      if (!v.position) messages.push('Fonction manquante');
      if (!role) messages.push(`Rôle non reconnu : « ${v.role} » (Enseignant, Secrétaire, Comptable ou Directeur)`);
      if (!hireDate) messages.push(`Date d'embauche illisible : « ${v.hireDate} »`);
      if (v.baseSalary && !baseSalary) messages.push(`Salaire illisible : « ${v.baseSalary} »`);
      if (v.phone && !normalizePhone(v.phone)) messages.push(`Téléphone invalide : « ${v.phone} »`);

      const label = `${v.lastName} ${v.firstName}`.trim() || `Ligne ${line}`;
      if (messages.length) return { line, label, status: 'error', messages };
      if (emails.has(email)) return { line, label, status: 'skipped', messages: [`Un compte existe déjà avec ${email}`] };
      emails.add(email);

      return {
        line,
        label,
        status: 'ok',
        messages: [],
        write: async () => {
          passwordHash ??= await bcrypt.hash(randomBytes(24).toString('base64'), 12);
          await this.prisma.user.create({
            data: {
              email,
              password: passwordHash,
              firstName: v.firstName,
              lastName: v.lastName,
              phone: normalizePhone(v.phone) ?? null,
              role: role as never,
              schoolId,
              staffMember: { create: { position: v.position, department: v.department || null, hireDate: hireDate!, baseSalary } },
            },
          });
        },
      };
    });
  }

  // ---------------------------------------------------------------- opening balances

  private async balances(_user: AuthUser, schoolId: string, rows: { line: number; values: Values }[]): Promise<Prepared[]> {
    const year = await this.currentYear(schoolId);
    const students = await this.prisma.student.findMany({
      where: { schoolId, archivedAt: null },
      select: { id: true, matricule: true, firstName: true, lastName: true, invoices: { where: { status: { not: 'CANCELLED' } }, select: { label: true, totalAmount: true } } },
    });
    const byMatricule = new Map(students.map((s) => [s.matricule.trim().toLowerCase(), s]));
    const seen = new Set<string>();
    const defaultDue = new Date(Date.now() + 30 * 86400000);

    return rows.map(({ line, values: v }) => {
      const messages: string[] = [];
      const student = byMatricule.get((v.matricule ?? '').toLowerCase());
      const amount = parseAmount(v.amount ?? '');
      const dueDate = v.dueDate ? parseDate(v.dueDate) : defaultDue;
      const label = v.label || 'Solde antérieur';
      if (!v.matricule) messages.push('Matricule manquant');
      else if (!student) messages.push(`Aucun élève actif avec le matricule ${v.matricule}`);
      if (!amount) messages.push(v.amount ? `Montant illisible : « ${v.amount} » (francs CFA entiers)` : 'Montant manquant');
      if (!dueDate) messages.push(`Échéance illisible : « ${v.dueDate} »`);

      const rowLabel = student ? `${student.lastName} ${student.firstName} · ${amount?.toLocaleString('fr-FR') ?? '?'} FCFA` : v.matricule || `Ligne ${line}`;
      if (messages.length || !student || !amount || !dueDate) return { line, label: rowLabel, status: 'error', messages };
      const identity = `${student.id}|${key(label)}|${amount}`;
      if (seen.has(identity) || student.invoices.some((i) => key(i.label) === key(label) && Math.round(i.totalAmount) === amount)) {
        return { line, label: rowLabel, status: 'skipped', messages: [`Une facture « ${label} » de ce montant existe déjà pour cet élève`] };
      }
      seen.add(identity);

      return {
        line,
        label: rowLabel,
        status: 'ok',
        messages: [],
        write: async () => {
          await this.prisma.$transaction(async (tx) => {
            await tx.invoice.create({
              data: {
                schoolId,
                studentId: student.id,
                academicYearId: year.id,
                reference: await this.sequences.invoiceReference(tx),
                label,
                totalAmount: amount,
                dueDate,
                status: dueDate < new Date() ? 'OVERDUE' : 'PENDING',
                items: { create: [{ label, amount }] },
              },
            });
          });
        },
      };
    });
  }

  // ---------------------------------------------------------------- marks

  private async grades(user: AuthUser, schoolId: string, rows: { line: number; values: Values }[]): Promise<Prepared[]> {
    const year = await this.currentYear(schoolId);
    // A teacher imports marks for his own classes and subjects only
    const allowed = await this.scope.gradeChecker(user);
    const [students, subjects, existing] = await Promise.all([
      this.prisma.student.findMany({
        where: { schoolId, archivedAt: null },
        select: { id: true, matricule: true, firstName: true, lastName: true, enrollments: { where: { withdrawalDate: null, class: { academicYearId: year.id } }, select: { classId: true }, take: 1 } },
      }),
      this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true, code: true } }),
      this.prisma.grade.findMany({ where: { class: { schoolId, academicYearId: year.id } }, select: { studentId: true, subjectId: true, termId: true, type: true, score: true, maxScore: true } }),
    ]);
    const byMatricule = new Map(students.map((s) => [s.matricule.trim().toLowerCase(), s]));
    const subjectByKey = new Map<string, string>();
    for (const s of subjects) {
      subjectByKey.set(key(s.name), s.id);
      subjectByKey.set(key(s.code), s.id);
    }
    const termByKey = new Map<string, string>();
    for (const t of year.terms) {
      termByKey.set(key(t.name), t.id);
      for (const short of [String(t.order), `t${t.order}`, `trimestre ${t.order}`, `semestre ${t.order}`, `s${t.order}`]) if (!termByKey.has(short)) termByKey.set(short, t.id);
    }
    const mark = (g: { studentId: string; subjectId: string; termId: string; type: string; score: number; maxScore: number }) => `${g.studentId}|${g.subjectId}|${g.termId}|${g.type}|${g.score}|${g.maxScore}`;
    const known = new Set(existing.map(mark));

    return rows.map(({ line, values: v }) => {
      const messages: string[] = [];
      const student = byMatricule.get((v.matricule ?? '').toLowerCase());
      const subjectId = subjectByKey.get(key(v.subject ?? ''));
      const termId = termByKey.get(key(v.term ?? ''));
      const parsed = parseScore(v.score ?? '');
      const scale = v.maxScore ? parseScore(v.maxScore)?.score : undefined;
      const maxScore = scale ?? parsed?.maxScore ?? 20;
      const type = parseGradeType(v.type ?? '');
      const classId = student?.enrollments[0]?.classId;
      if (!v.matricule) messages.push('Matricule manquant');
      else if (!student) messages.push(`Aucun élève actif avec le matricule ${v.matricule}`);
      else if (!classId) messages.push(`${student.lastName} ${student.firstName} n'est inscrit dans aucune classe cette année`);
      if (!subjectId) messages.push(v.subject ? `Matière « ${v.subject} » introuvable` : 'Matière manquante');
      if (!termId) messages.push(v.term ? `Période « ${v.term} » introuvable pour ${year.name}` : 'Période manquante');
      if (!parsed) messages.push(v.score ? `Note illisible : « ${v.score} »` : 'Note manquante');
      else if (maxScore <= 0 || maxScore > 100) messages.push(`Barème invalide : ${maxScore}`);
      else if (parsed.score > maxScore) messages.push(`La note ${parsed.score} dépasse le barème ${maxScore}`);
      if (!type) messages.push(`Type d'évaluation non reconnu : « ${v.type} »`);
      if (classId && subjectId && !allowed(classId, subjectId)) messages.push(`${v.subject} ne vous est pas affectée dans la classe de cet élève`);

      const label = student ? `${student.lastName} ${student.firstName} · ${v.subject} · ${v.score}` : v.matricule || `Ligne ${line}`;
      if (messages.length || !student || !classId || !subjectId || !termId || !parsed || !type) return { line, label, status: 'error', messages };
      const data = { studentId: student.id, subjectId, termId, type, score: parsed.score, maxScore };
      if (known.has(mark(data))) return { line, label, status: 'skipped', messages: ['Cette note est déjà enregistrée'] };
      known.add(mark(data));

      return {
        line,
        label,
        status: 'ok',
        messages: [],
        write: async () => {
          await this.prisma.grade.create({ data: { ...data, type: type as never, classId, comment: v.comment || null, enteredById: user.userId } });
        },
      };
    });
  }
}

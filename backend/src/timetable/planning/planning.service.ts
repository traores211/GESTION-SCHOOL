import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/current-user.decorator';
import { buildPeriods, formatHours, lessonHours } from '../domain/grid';
import { formatSlot, fromMinutes, toMinutes } from '../domain/time';
import { LessonInput, PlanningData, StoredLesson, checkLesson, failureMessages, isQualified, roomMismatch, volumeKey } from '../domain/rules';
import { GenerateResult, generateTimetable } from '../domain/generator';
import { SESSION_INCLUDE, TimetableService, describe, describeChange, snapshot } from '../timetable.service';
import { ChangeInput, PlanningDataService, SessionSnapshot } from './planning-data.service';
import { GenerateApplyDto, GenerateScopeDto, OptionsQueryDto } from './planning.dto';

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PlanningDataService,
    private readonly timetable: TimetableService,
  ) {}

  private async context(user: AuthUser, academicYearId?: string) {
    const schoolId = this.timetable.requireSchool(user);
    const yearId = await this.timetable.resolveYearId(schoolId, academicYearId);
    const [data, lessons] = await Promise.all([this.planning.loadData(schoolId, yearId), this.planning.yearLessons(schoolId, yearId)]);
    return { schoolId, yearId, data, lessons };
  }

  private async owned(schoolId: string, id: string) {
    const found = await this.prisma.timetableSession.findFirst({ where: { id, schoolId }, include: SESSION_INCLUDE });
    if (!found) throw new NotFoundException('Séance introuvable');
    return found;
  }

  // ---------------------------------------------------------------- lesson form options

  /**
   * Lists filtered for the lesson form: qualified teachers first (with their load), rooms that suit
   * the subject (and are free on the slot), and the free slots of the chosen teacher for the class.
   */
  async options(user: AuthUser, q: OptionsQueryDto) {
    const schoolId = this.timetable.requireSchool(user);
    const klass = await this.prisma.class.findFirst({ where: { id: q.classId, schoolId }, select: { academicYearId: true } });
    if (!klass) throw new NotFoundException('Classe introuvable');
    const { data, lessons } = await this.context(user, klass.academicYearId);
    const others = lessons.filter((l) => l.id !== q.excludeId);
    const slot = q.dayOfWeek && q.startTime && q.endTime && q.startTime < q.endTime ? { dayOfWeek: q.dayOfWeek, startTime: q.startTime, endTime: q.endTime } : null;

    const loadOf = (teacherId: string) => others.filter((l) => l.teacherId === teacherId).reduce((s, l) => s + lessonHours(l.startTime, l.endTime, data.grid), 0);
    const teachers = [...data.teachers.values()]
      .map((t) => {
        const qualified = q.subjectId ? isQualified(data, t.id, q.subjectId, q.classId) : true;
        let free: boolean | null = null;
        if (slot) {
          const report = checkLesson({ classId: q.classId, subjectId: q.subjectId, teacherId: t.id, ...slot, id: q.excludeId }, data, lessons);
          free = report.checks.every((c) => !['AVAILABLE', 'TEACHER_FREE', 'TEACHER_MAX'].includes(c.id) || c.status !== 'fail');
        }
        return {
          id: t.id,
          name: t.name,
          qualified,
          free,
          loadHours: loadOf(t.id),
          maxHours: t.weeklyMaxMinutes == null ? null : t.weeklyMaxMinutes / 60,
        };
      })
      .sort((a, b) => Number(b.qualified) - Number(a.qualified) || Number(b.free !== false) - Number(a.free !== false) || a.name.localeCompare(b.name));

    const rooms = [...data.rooms.values()]
      .map((r) => {
        const mismatch = roomMismatch(data, r.id, q.subjectId);
        const taken = slot
          ? others.find((l) => l.roomId === r.id && l.dayOfWeek === slot.dayOfWeek && l.startTime < slot.endTime && slot.startTime < l.endTime)
          : undefined;
        return {
          id: r.id,
          name: r.name,
          suitable: !mismatch,
          free: slot ? !taken : null,
          reason: mismatch ?? (taken ? `Occupée par ${data.classes.get(taken.classId)?.name} ${taken.startTime}–${taken.endTime}` : null),
        };
      })
      .sort((a, b) => Number(b.suitable) - Number(a.suitable) || Number(b.free !== false) - Number(a.free !== false) || a.name.localeCompare(b.name));

    // Free slots: every grid position where the class and the teacher are both free and the
    // teacher is available (room and volumes aside, they are checked on save).
    const freeSlots: { dayOfWeek: number; startTime: string; endTime: string }[] = [];
    if (q.teacherId) {
      const duration = q.durationMinutes ?? data.grid.slotMinutes;
      for (const [day, periods] of buildPeriods(data.grid)) {
        for (const p of periods) {
          const endMin = toMinutes(p.start) + duration;
          const candidate = { classId: q.classId, subjectId: q.subjectId, teacherId: q.teacherId, dayOfWeek: day, startTime: p.start, endTime: fromMinutes(endMin), id: q.excludeId };
          const report = checkLesson(candidate, data, lessons);
          const blocking = report.checks.filter((c) => c.status === 'fail' && ['GRID', 'AVAILABLE', 'TEACHER_FREE', 'CLASS_FREE', 'DAY_MAX'].includes(c.id));
          if (!blocking.length) freeSlots.push({ dayOfWeek: day, startTime: candidate.startTime, endTime: candidate.endTime });
        }
      }
    }

    const volume = q.subjectId ? data.volumes.get(volumeKey(data.classes.get(q.classId)!.level, q.subjectId)) : undefined;
    const planned = q.subjectId
      ? others.filter((l) => l.classId === q.classId && l.subjectId === q.subjectId).reduce((s, l) => s + lessonHours(l.startTime, l.endTime, data.grid), 0)
      : 0;
    return {
      teachers,
      rooms,
      freeSlots,
      volume: volume ? { officialHours: volume.minutesPerWeek / 60, plannedHours: planned, maxSessionHours: volume.maxSessionMinutes ? volume.maxSessionMinutes / 60 : null } : null,
    };
  }

  // ---------------------------------------------------------------- suggestions after a refusal

  /** Where else this lesson could go, and which other teachers could take it on its current slot. */
  async suggestions(user: AuthUser, id: string) {
    const schoolId = this.timetable.requireSchool(user);
    const session = await this.owned(schoolId, id);
    const { data, lessons } = await this.context(user, session.academicYearId);
    return suggestFor(session, data, lessons);
  }

  // ---------------------------------------------------------------- swap & lock

  /** Exchanges the slots of two lessons; both must pass every rule in their new place. */
  async swap(user: AuthUser, id: string, otherId: string) {
    if (id === otherId) throw new BadRequestException('Choisissez deux cours différents');
    const schoolId = this.timetable.requireSchool(user);
    const [a, b] = await Promise.all([this.owned(schoolId, id), this.owned(schoolId, otherId)]);
    if (a.academicYearId !== b.academicYearId) throw new BadRequestException('Les deux cours doivent appartenir à la même année scolaire');
    const { data, lessons } = await this.context(user, a.academicYearId);
    const durA = toMinutes(a.endTime) - toMinutes(a.startTime);
    const durB = toMinutes(b.endTime) - toMinutes(b.startTime);
    const movedA = { ...a, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: fromMinutes(toMinutes(b.startTime) + durA) };
    const movedB = { ...b, dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: fromMinutes(toMinutes(a.startTime) + durB) };
    const state = lessons.map((l) => (l.id === a.id ? movedA : l.id === b.id ? movedB : l));
    for (const [moved, label] of [[movedA, describe(a)], [movedB, describe(b)]] as const) {
      const report = checkLesson(moved, data, state);
      if (!report.ok) {
        throw new ConflictException({ message: `Échange refusé (${label}) : ${failureMessages(report).join(' · ')}`, checks: report.checks, warnings: report.warnings, conflicts: [] });
      }
    }
    const batch = this.planning.newBatch();
    await this.prisma.$transaction(async (tx) => {
      const changes: ChangeInput[] = [];
      for (const [before, moved] of [[a, movedA], [b, movedB]] as const) {
        const after = await tx.timetableSession.update({
          where: { id: before.id },
          data: { dayOfWeek: moved.dayOfWeek, startTime: moved.startTime, endTime: moved.endTime },
          include: SESSION_INCLUDE,
        });
        changes.push({ action: 'SWAP', sessionId: before.id, before: snapshot(before), after: snapshot(after), summary: `Échange : ${describe(before)} → ${describeChange(before, after)}` });
      }
      await this.planning.record(tx, user, schoolId, a.academicYearId, batch, changes);
    });
    return { success: true, batchId: batch };
  }

  async lock(user: AuthUser, id: string, locked: boolean) {
    const schoolId = this.timetable.requireSchool(user);
    const before = await this.owned(schoolId, id);
    if (before.locked === locked) return { success: true, locked };
    const batch = this.planning.newBatch();
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.timetableSession.update({ where: { id }, data: { locked }, include: SESSION_INCLUDE });
      await this.planning.record(tx, user, schoolId, before.academicYearId, batch, [
        { action: 'LOCK', sessionId: id, before: snapshot(before), after: snapshot(after), summary: `${locked ? 'Verrouillage' : 'Déverrouillage'} : ${describe(before)}` },
      ]);
    });
    return { success: true, locked };
  }

  /** Locks or unlocks every lesson of a class. */
  async lockClass(user: AuthUser, classId: string, locked: boolean) {
    const schoolId = this.timetable.requireSchool(user);
    const klass = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true, academicYearId: true } });
    if (!klass) throw new NotFoundException('Classe introuvable');
    const sessions = await this.prisma.timetableSession.findMany({ where: { classId, schoolId, locked: !locked }, include: SESSION_INCLUDE });
    if (!sessions.length) return { success: true, count: 0 };
    const batch = this.planning.newBatch();
    await this.prisma.$transaction(async (tx) => {
      await tx.timetableSession.updateMany({ where: { id: { in: sessions.map((s) => s.id) } }, data: { locked } });
      await this.planning.record(
        tx,
        user,
        schoolId,
        klass.academicYearId,
        batch,
        sessions.map((s) => ({
          action: 'LOCK' as const,
          sessionId: s.id,
          before: snapshot(s),
          after: { ...snapshot(s), locked },
          summary: `${locked ? 'Verrouillage' : 'Déverrouillage'} de ${klass.name} : ${describe(s)}`,
        })),
      );
    });
    return { success: true, count: sessions.length };
  }

  // ---------------------------------------------------------------- history & undo

  async history(user: AuthUser, academicYearId?: string, limit = 50) {
    const schoolId = this.timetable.requireSchool(user);
    const yearId = await this.timetable.resolveYearId(schoolId, academicYearId);
    const rows = await this.prisma.timetableChange.findMany({
      where: { schoolId, academicYearId: yearId },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    const batches = new Map<string, typeof rows>();
    for (const r of rows) batches.set(r.batchId, [...(batches.get(r.batchId) ?? []), r]);
    return [...batches.entries()].slice(0, limit).map(([batchId, list]) => {
      const first = list[0];
      const head = list.find((c) => c.action === 'GENERATE');
      const action = head?.action ?? first.action;
      const details = list.filter((c) => c !== head);
      return {
        batchId,
        action,
        userName: first.userName,
        createdAt: first.createdAt,
        undone: list.every((c) => !!c.undoneAt),
        undoable: action !== 'UNDO' && list.every((c) => !c.undoneAt),
        count: details.length || 1,
        summary: head ? head.summary : list.map((c) => c.summary).slice(0, 3).join(' · ') + (list.length > 3 ? ` · … (${list.length})` : ''),
        changes: details.slice(0, 20).map((c) => ({
          action: c.action,
          summary: c.summary,
          before: c.before ? JSON.parse(c.before) : null,
          after: c.after ? JSON.parse(c.after) : null,
        })),
      };
    });
  }

  /**
   * Undoes a batch of changes. Refused when a lesson changed again since, or when restoring the
   * previous state would now break a rule (the slot was taken in the meantime).
   */
  async undo(user: AuthUser, batchId: string) {
    const schoolId = this.timetable.requireSchool(user);
    const changes = await this.prisma.timetableChange.findMany({ where: { schoolId, batchId } });
    if (!changes.length) throw new NotFoundException('Modification introuvable');
    if (changes.some((c) => c.undoneAt)) throw new ConflictException('Cette modification a déjà été annulée');
    if (changes.some((c) => c.action === 'UNDO')) throw new BadRequestException("Une annulation ne peut pas être annulée ; refaites la modification");
    const yearId = changes[0].academicYearId;
    const { data, lessons } = await this.context(user, yearId);
    const ids = changes.map((c) => c.sessionId).filter((x): x is string => !!x);
    const current = new Map((await this.prisma.timetableSession.findMany({ where: { id: { in: ids } }, include: SESSION_INCLUDE })).map((s) => [s.id, s]));

    const same = (s: SessionSnapshot, snap: SessionSnapshot) =>
      (['classId', 'subjectId', 'teacherId', 'roomId', 'dayOfWeek', 'startTime', 'endTime', 'locked'] as const).every((k) => s[k] === snap[k]);
    let state: StoredLesson[] = [...lessons];
    const restored: StoredLesson[] = [];
    for (const c of changes) {
      if (!c.sessionId) continue; // summary line of a generation
      const before = c.before ? (JSON.parse(c.before) as SessionSnapshot) : null;
      const after = c.after ? (JSON.parse(c.after) as SessionSnapshot) : null;
      const now = c.sessionId ? current.get(c.sessionId) : undefined;
      if (c.action === 'CREATE') {
        if (now && after && !same(snapshot(now), after)) throw new ConflictException(`Annulation impossible : « ${describe(now)} » a été modifié depuis`);
        state = state.filter((l) => l.id !== c.sessionId);
      } else if (c.action === 'DELETE') {
        if (now) throw new ConflictException('Annulation impossible : le cours supprimé existe de nouveau');
        state.push(before as StoredLesson);
        restored.push(before as StoredLesson);
      } else {
        if (!now) throw new ConflictException(`Annulation impossible : un cours concerné a été supprimé depuis (${c.summary})`);
        if (after && !same(snapshot(now), after)) throw new ConflictException(`Annulation impossible : « ${describe(now)} » a été modifié depuis`);
        state = state.map((l) => (l.id === c.sessionId ? (before as StoredLesson) : l));
        restored.push(before as StoredLesson);
      }
    }
    for (const lesson of restored) {
      const report = checkLesson(lesson, data, state);
      if (!report.ok) throw new ConflictException(`Annulation impossible : ${failureMessages(report).join(' · ')}`);
    }

    const imports = new Set((await this.prisma.timetableImport.findMany({ where: { schoolId }, select: { id: true } })).map((i) => i.id));
    const undoBatch = this.planning.newBatch();
    await this.prisma.$transaction(
      async (tx) => {
        const toDelete = changes.filter((c) => c.action === 'CREATE' && c.sessionId && current.has(c.sessionId)).map((c) => c.sessionId!);
        if (toDelete.length) await tx.timetableSession.deleteMany({ where: { id: { in: toDelete }, schoolId } });
        const toCreate = changes.filter((c) => c.action === 'DELETE').map((c) => JSON.parse(c.before!) as SessionSnapshot);
        if (toCreate.length) {
          await tx.timetableSession.createMany({
            data: toCreate.map((s) => ({ ...s, importId: s.importId && imports.has(s.importId) ? s.importId : null, schoolId, academicYearId: yearId })),
          });
        }
        for (const c of changes.filter((x) => x.sessionId && !['CREATE', 'DELETE'].includes(x.action))) {
          const { id, importId, ...fields } = JSON.parse(c.before!) as SessionSnapshot;
          void importId;
          await tx.timetableSession.update({ where: { id }, data: fields });
        }
        await tx.timetableChange.updateMany({ where: { batchId, schoolId }, data: { undoneAt: new Date() } });
        const label = changes.find((c) => c.action === 'GENERATE')?.summary ?? changes[0].summary;
        await this.planning.record(tx, user, schoolId, yearId, undoBatch, [{ action: 'UNDO', summary: `Annulation : ${label}${changes.length > 1 ? ` (${changes.length} changements)` : ''}` }]);
      },
      { timeout: 30_000 },
    );
    return { success: true, restored: changes.length };
  }

  // ---------------------------------------------------------------- generation

  private async scopeClasses(schoolId: string, yearId: string, dto: GenerateScopeDto) {
    const classes = await this.prisma.class.findMany({ where: { schoolId, academicYearId: yearId }, select: { id: true, name: true, level: true }, orderBy: [{ level: 'asc' }, { name: 'asc' }] });
    if (dto.scope === 'class') {
      const one = classes.find((c) => c.id === dto.classId);
      if (!one) throw new NotFoundException('Classe introuvable');
      return [one];
    }
    if (dto.scope === 'level') {
      const list = classes.filter((c) => c.level === dto.level);
      if (!list.length) throw new NotFoundException(`Aucune classe pour le niveau ${dto.level ?? '?'}`);
      return list;
    }
    return classes;
  }

  /** Generates a proposal for the scope. Nothing is saved. */
  async generatePreview(user: AuthUser, dto: GenerateScopeDto) {
    const { schoolId, yearId, data, lessons } = await this.context(user, dto.academicYearId);
    const classes = await this.scopeClasses(schoolId, yearId, dto);
    const scope = new Set(classes.map((c) => c.id));
    const fixed = lessons.filter((l) => !scope.has(l.classId) || l.locked);
    const replaced = lessons.filter((l) => scope.has(l.classId) && !l.locked).length;
    const preferred = new Map(
      (await this.prisma.classSubject.findMany({ where: { classId: { in: [...scope] }, teacherId: { not: null } }, select: { classId: true, subjectId: true, teacherId: true } })).map(
        (cs) => [`${cs.classId}|${cs.subjectId}`, cs.teacherId!],
      ),
    );
    const result = generateTimetable(data, fixed, { classIds: [...scope], preferredTeachers: preferred });
    return { ...this.presentResult(result, data), replaced, locked: lessons.filter((l) => scope.has(l.classId) && l.locked).length, scope: dto };
  }

  private presentResult(result: GenerateResult, data: PlanningData) {
    return {
      ...result,
      lessons: result.lessons.map((l) => ({
        ...l,
        className: data.classes.get(l.classId)?.name,
        subjectName: data.subjects.get(l.subjectId)?.name,
        teacherName: data.teachers.get(l.teacherId)?.name,
        roomName: l.roomId ? data.rooms.get(l.roomId)?.name ?? null : null,
      })),
    };
  }

  /**
   * Saves a proposal: unlocked lessons of the scope are replaced. Every proposed lesson is checked
   * again against the current timetable, so a proposal made stale by other edits is refused.
   */
  async generateApply(user: AuthUser, dto: GenerateApplyDto) {
    const { schoolId, yearId, data, lessons } = await this.context(user, dto.academicYearId);
    const classes = await this.scopeClasses(schoolId, yearId, dto);
    const scope = new Set(classes.map((c) => c.id));
    const outside = dto.lessons.find((l) => !scope.has(l.classId));
    if (outside) throw new BadRequestException('La proposition contient une classe hors du périmètre choisi');
    const removed = lessons.filter((l) => scope.has(l.classId) && !l.locked);
    const state: StoredLesson[] = lessons.filter((l) => !scope.has(l.classId) || l.locked);
    const created = dto.lessons.map((l) => ({ ...l, roomId: l.roomId ?? null, id: randomUUID() }));
    for (const lesson of created) {
      const report = checkLesson(lesson, data, state);
      if (!report.ok) {
        throw new ConflictException(
          `L'emploi du temps a changé depuis l'aperçu (${data.classes.get(lesson.classId)?.name}, ${formatSlot(lesson.dayOfWeek, lesson.startTime, lesson.endTime)} : ${failureMessages(report).join(' · ')}). Relancez la génération.`,
        );
      }
      state.push(lesson);
    }

    const scopeLabel = dto.scope === 'all' ? 'toutes les classes' : dto.scope === 'level' ? `niveau ${dto.level}` : classes[0].name;
    const batch = this.planning.newBatch();
    await this.prisma.$transaction(
      async (tx) => {
        const old = await tx.timetableSession.findMany({ where: { id: { in: removed.map((r) => r.id) } } });
        await tx.timetableSession.deleteMany({ where: { id: { in: removed.map((r) => r.id) }, schoolId } });
        await tx.timetableSession.createMany({ data: created.map((l) => ({ ...l, schoolId, academicYearId: yearId })) });
        const hours = created.reduce((s, l) => s + lessonHours(l.startTime, l.endTime, data.grid), 0);
        const name = (l: LessonInput) => `${data.subjects.get(l.subjectId ?? '')?.name ?? 'Séance'} · ${data.classes.get(l.classId)?.name} · ${formatSlot(l.dayOfWeek, l.startTime, l.endTime)}`;
        await this.planning.record(tx, user, schoolId, yearId, batch, [
          {
            action: 'GENERATE',
            summary: `Génération (${scopeLabel}) : ${created.length} cours, ${formatHours(hours)} placées, ${old.length} cours remplacés`,
          },
          ...old.map((o) => ({ action: 'DELETE' as const, sessionId: o.id, before: snapshot(o), summary: `Remplacé : ${name(o)}` })),
          ...created.map((c) => ({ action: 'CREATE' as const, sessionId: c.id, after: { ...c, termId: null, label: null, notes: null, locked: false, importId: null }, summary: `Généré : ${name(c)}` })),
        ]);
      },
      { timeout: 60_000 },
    );
    return { success: true, created: created.length, replaced: removed.length, batchId: batch };
  }

  // ---------------------------------------------------------------- compliance

  /** Planned vs official hours per class (and subject) and per teacher (vs their maximum load). */
  async compliance(user: AuthUser, academicYearId?: string) {
    const { data, lessons } = await this.context(user, academicYearId);
    const hours = (list: StoredLesson[]) => list.reduce((s, l) => s + lessonHours(l.startTime, l.endTime, data.grid), 0);
    const status = (planned: number, official: number) => (planned < official - 1e-6 ? 'missing' : planned > official + 1e-6 ? 'over' : 'ok');

    const classes = [...data.classes.values()]
      .sort((a, b) => a.level.localeCompare(b.level) || a.name.localeCompare(b.name))
      .map((c) => {
        const mine = lessons.filter((l) => l.classId === c.id);
        const subjects = [...data.volumes.entries()]
          .filter(([k]) => k.startsWith(`${c.level}|`))
          .map(([k, v]) => {
            const subjectId = k.slice(c.level.length + 1);
            const planned = hours(mine.filter((l) => l.subjectId === subjectId));
            const official = v.minutesPerWeek / 60;
            return { subjectId, subjectName: data.subjects.get(subjectId)?.name ?? '?', officialHours: official, plannedHours: planned, status: status(planned, official) };
          });
        const withVolume = new Set(subjects.map((s) => s.subjectId));
        for (const subjectId of new Set(mine.map((l) => l.subjectId).filter((s): s is string => !!s && !withVolume.has(s)))) {
          subjects.push({ subjectId, subjectName: data.subjects.get(subjectId)?.name ?? '?', officialHours: 0, plannedHours: hours(mine.filter((l) => l.subjectId === subjectId)), status: 'over' });
        }
        subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
        const officialHours = subjects.reduce((s, x) => s + x.officialHours, 0);
        const plannedHours = hours(mine);
        return {
          classId: c.id,
          className: c.name,
          level: c.level,
          officialHours,
          plannedHours,
          missing: subjects.filter((s) => s.status === 'missing').length,
          over: subjects.filter((s) => s.status === 'over').length,
          status: subjects.some((s) => s.status === 'over') ? 'over' : subjects.some((s) => s.status === 'missing') ? 'missing' : subjects.length ? 'ok' : 'none',
          subjects,
        };
      });

    const teachers = [...data.teachers.values()]
      .map((t) => {
        const mine = lessons.filter((l) => l.teacherId === t.id);
        const planned = hours(mine);
        const max = t.weeklyMaxMinutes == null ? null : t.weeklyMaxMinutes / 60;
        const unqualified = mine.filter((l) => l.subjectId && !isQualified(data, t.id, l.subjectId, l.classId)).length;
        return {
          teacherId: t.id,
          teacherName: t.name,
          plannedHours: planned,
          maxHours: max,
          lessons: mine.length,
          unqualified,
          status: max == null ? (planned ? 'none' : 'idle') : status(planned, max),
        };
      })
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName));

    return {
      classes,
      teachers,
      totals: {
        classesOk: classes.filter((c) => c.status === 'ok').length,
        classesMissing: classes.filter((c) => c.status === 'missing').length,
        classesOver: classes.filter((c) => c.status === 'over').length,
        officialHours: classes.reduce((s, c) => s + c.officialHours, 0),
        plannedHours: classes.reduce((s, c) => s + Math.min(c.plannedHours, c.officialHours || c.plannedHours), 0),
        teachersOver: teachers.filter((t) => t.status === 'over').length,
      },
    };
  }
}

/** Valid alternative slots (same duration) and teachers for a lesson, best first. */
export function suggestFor(session: StoredLesson, data: PlanningData, lessons: StoredLesson[]) {
  const duration = toMinutes(session.endTime) - toMinutes(session.startTime);
  const slots: { dayOfWeek: number; startTime: string; endTime: string; warnings: number }[] = [];
  for (const [day, periods] of buildPeriods(data.grid)) {
    for (const p of periods) {
      const end = fromMinutes(toMinutes(p.start) + duration);
      if (day === session.dayOfWeek && p.start === session.startTime) continue;
      const report = checkLesson({ ...session, dayOfWeek: day, startTime: p.start, endTime: end }, data, lessons);
      if (report.ok) slots.push({ dayOfWeek: day, startTime: p.start, endTime: end, warnings: report.warnings.length });
    }
  }
  slots.sort((a, b) => a.warnings - b.warnings || a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  const teachers = [...data.teachers.values()]
    .filter((t) => t.id !== session.teacherId)
    .filter((t) => checkLesson({ ...session, teacherId: t.id }, data, lessons).ok)
    .filter((t) => !session.subjectId || isQualified(data, t.id, session.subjectId, session.classId))
    .map((t) => ({ id: t.id, name: t.name }));
  const rooms = [...data.rooms.values()]
    .filter((r) => r.id !== session.roomId)
    .filter((r) => checkLesson({ ...session, roomId: r.id }, data, lessons).checks.find((c) => c.id === 'ROOM')?.status === 'ok')
    .map((r) => ({ id: r.id, name: r.name }));
  return { slots: slots.slice(0, 12), teachers, rooms };
}

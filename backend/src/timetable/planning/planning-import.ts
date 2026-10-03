/**
 * Planning file ("Professeurs" + "Volumes horaires officiels") → validated rows and a payload to save.
 * Pure: the service reads the file and saves the payload once the user has confirmed.
 */
import { DAY_NAMES } from '../domain/time';
import { YearGrid, gridIssue } from '../domain/grid';
import { classKey, parseDay, parseHours, parseTime, personKey, subjectKey, textKey } from '../import/normalize';
import { ParsedTable } from '../import/types';

export const TEACHER_HEADERS = ['Matricule', 'Nom', 'Prénoms', 'Matière(s)', 'Niveaux/classes enseignés', 'Jour', 'Heure début', 'Heure fin', 'Volume hebdo max (h)'];
export const VOLUME_HEADERS = ['Niveau', 'Matière', 'Heures/semaine', "Durée max d'une séance (h)", 'Coefficient'];

export interface ImportReference {
  classes: { id: string; name: string; level: string }[];
  subjects: { id: string; name: string; code: string }[];
  teachers: { id: string; name: string; firstName: string; lastName: string; matricule: string | null }[];
  grid: YearGrid;
}

export interface ReportRow {
  sheet: 'teachers' | 'volumes';
  line: number;
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  warnings: string[];
  cells: string[];
}

export interface TeacherPayload {
  teacherId: string;
  teacherName: string;
  matricule: string | null;
  weeklyMaxMinutes: number | null;
  qualifications: { subjectId: string; level: string; classId: string | null }[];
  availability: { dayOfWeek: number; startTime: string; endTime: string }[];
}

export interface VolumePayload {
  level: string;
  subjectId: string;
  minutesPerWeek: number;
  maxSessionMinutes: number | null;
  coefficient: number | null;
}

export interface PlanningImportReport {
  sheets: { teachers: string | null; volumes: string | null };
  rows: ReportRow[];
  summary: { valid: number; warnings: number; errors: number; teachers: number; availabilities: number; qualifications: number; volumes: number };
  payload: { teachers: TeacherPayload[]; volumes: VolumePayload[] };
}

type Column = 'matricule' | 'lastName' | 'firstName' | 'subjects' | 'scope' | 'day' | 'start' | 'end' | 'max' | 'level' | 'subject' | 'hours' | 'maxSession' | 'coefficient';

const HEADER_PATTERNS: [Column, RegExp][] = [
  ['matricule', /^(matricule|mle|id|code)( enseignant| professeur)?$/],
  ['firstName', /^prenoms?$/],
  ['lastName', /^nom( de famille)?$/],
  ['subjects', /^matieres?( s)?( enseignees?)?$/],
  ['scope', /^(niveaux?|classes?|niveaux? classes?|niveaux? et classes?|niveaux? ou classes?)( s)?( enseignes?)?$/],
  ['day', /^jours?$/],
  ['start', /^(heure )?(de )?debut$/],
  ['end', /^(heure )?(de )?fin$/],
  ['max', /^(volume|obligation|service|heures?)( hebdo(madaire)?| de service)?( max(imum)?)?( h)?$/],
  ['hours', /^(heures? (par )?semaine|heures? semaine|volume( horaire)?( hebdo(madaire)?)?|h semaine)( h)?$/],
  ['maxSession', /^duree max(imale)?( d une)?( seance)?( h)?$/],
  ['coefficient', /^coef(ficient)?( optionnel)?$/],
];

function headerMap(row: string[]): Map<Column, number> {
  const map = new Map<Column, number>();
  row.forEach((cell, i) => {
    const key = textKey(cell);
    if (!key) return;
    // "Niveau" alone is the level column of the volumes sheet, "Matière" alone its subject column.
    if (key === 'niveau' && !map.has('level')) return void map.set('level', i);
    if ((key === 'matiere') && !map.has('subject')) map.set('subject', i);
    for (const [col, pattern] of HEADER_PATTERNS) {
      if (!map.has(col) && pattern.test(key)) {
        map.set(col, i);
        break;
      }
    }
  });
  return map;
}

function findHeader(table: ParsedTable): { index: number; map: Map<Column, number> } | null {
  for (let i = 0; i < Math.min(6, table.rows.length); i++) {
    const map = headerMap(table.rows[i]);
    if (map.size >= 3) return { index: i, map };
  }
  return null;
}

function kindOf(table: ParsedTable, map: Map<Column, number>): 'teachers' | 'volumes' | null {
  const name = textKey(table.name ?? '');
  if (/prof|enseignant/.test(name)) return 'teachers';
  if (/volume|horaire officiel/.test(name)) return 'volumes';
  if (map.has('matricule') || map.has('day') || map.has('start')) return 'teachers';
  if (map.has('level') && (map.has('hours') || map.has('maxSession'))) return 'volumes';
  return null;
}

const split = (value: string) =>
  value
    .split(/[,;/+\n]| et /i)
    .map((s) => s.trim())
    .filter(Boolean);

/** Level key so "6ème", "6e", "6EME" and "Sixième" compare equal. */
function levelKey(value: string) {
  const k = classKey(value).replace(/\bsixieme\b/, '6e').replace(/\bcinquieme\b/, '5e').replace(/\bquatrieme\b/, '4e').replace(/\btroisieme\b/, '3e').replace(/\bpremiere\b/, '1re');
  return k;
}

export function analyzePlanningTables(tables: ParsedTable[], ref: ImportReference): PlanningImportReport {
  const rows: ReportRow[] = [];
  const sheets: PlanningImportReport['sheets'] = { teachers: null, volumes: null };
  const levels = [...new Set(ref.classes.map((c) => c.level))];
  const levelByKey = new Map(levels.map((l) => [levelKey(l), l]));
  const classByKey = new Map(ref.classes.map((c) => [classKey(c.name), c]));
  const subjectByKey = new Map<string, { id: string; name: string }>();
  for (const s of ref.subjects) {
    subjectByKey.set(subjectKey(s.name), s);
    subjectByKey.set(textKey(s.code), s);
  }
  const teacherByMatricule = new Map(ref.teachers.filter((t) => t.matricule).map((t) => [textKey(t.matricule!), t]));
  const teacherByName = new Map<string, (typeof ref.teachers)[number][]>();
  for (const t of ref.teachers) {
    const k = personKey(`${t.firstName} ${t.lastName}`);
    teacherByName.set(k, [...(teacherByName.get(k) ?? []), t]);
  }

  const teachers = new Map<string, TeacherPayload & { maxLine?: number }>();
  const windowsSeen = new Map<string, { day: number; start: string; end: string; line: number }[]>();
  const volumes = new Map<string, VolumePayload & { line: number }>();

  for (const table of tables) {
    const header = findHeader(table);
    if (!header) continue;
    const kind = kindOf(table, header.map);
    if (!kind) continue;
    if (sheets[kind]) continue;
    sheets[kind] = table.name ?? (kind === 'teachers' ? 'Professeurs' : 'Volumes');
    const get = (r: string[], c: Column) => (header.map.has(c) ? (r[header.map.get(c)!] ?? '').trim() : '');

    table.rows.slice(header.index + 1).forEach((r, i) => {
      if (!r.some((c) => c && c.trim())) return;
      const line = header.index + i + 2;
      const errors: string[] = [];
      const warnings: string[] = [];

      if (kind === 'teachers') {
        const matricule = get(r, 'matricule');
        const lastName = get(r, 'lastName');
        const firstName = get(r, 'firstName');
        let teacher = matricule ? teacherByMatricule.get(textKey(matricule)) : undefined;
        if (!teacher && (lastName || firstName)) {
          const found = teacherByName.get(personKey(`${firstName} ${lastName}`)) ?? [];
          if (found.length === 1) teacher = found[0];
          else if (found.length > 1) errors.push(`Plusieurs enseignants s'appellent ${firstName} ${lastName} : renseignez le matricule`);
        }
        if (!matricule && !lastName) errors.push('Matricule ou nom obligatoire');
        else if (!teacher && !errors.length) {
          errors.push(`Enseignant inconnu (${[matricule && `matricule ${matricule}`, [firstName, lastName].filter(Boolean).join(' ')].filter(Boolean).join(', ')}) : créez-le d'abord dans Personnel`);
        } else if (teacher && matricule && teacher.matricule && textKey(teacher.matricule) !== textKey(matricule)) {
          errors.push(`Le matricule ${matricule} ne correspond pas à ${teacher.name} (matricule ${teacher.matricule})`);
        }

        const subjectIds: string[] = [];
        const rawSubjects = split(get(r, 'subjects'));
        if (!rawSubjects.length) errors.push('Matière(s) manquante(s)');
        for (const s of rawSubjects) {
          const found = subjectByKey.get(subjectKey(s)) ?? subjectByKey.get(textKey(s));
          if (found) subjectIds.push(found.id);
          else errors.push(`Matière inconnue : « ${s} »`);
        }
        const scopes: { level: string; classId: string | null }[] = [];
        const rawScopes = split(get(r, 'scope'));
        if (!rawScopes.length) errors.push('Niveaux/classes enseignés manquants');
        for (const s of rawScopes) {
          const level = levelByKey.get(levelKey(s));
          const klass = classByKey.get(classKey(s));
          if (klass) scopes.push({ level: klass.level, classId: klass.id });
          else if (level) scopes.push({ level, classId: null });
          else errors.push(`Niveau ou classe inconnu : « ${s} »`);
        }

        const dayRaw = get(r, 'day');
        const startRaw = get(r, 'start');
        const endRaw = get(r, 'end');
        let window: { day: number; start: string; end: string } | null = null;
        if (!dayRaw && !startRaw && !endRaw) {
          warnings.push('Aucune disponibilité sur cette ligne (habilitations seulement)');
        } else {
          const day = parseDay(dayRaw);
          const start = parseTime(startRaw);
          const end = parseTime(endRaw);
          if (!day) errors.push(dayRaw ? `Jour invalide : « ${dayRaw} »` : 'Jour manquant');
          if (!start) errors.push(startRaw ? `Heure de début invalide : « ${startRaw} » (format attendu 08:00)` : 'Heure de début manquante');
          if (!end) errors.push(endRaw ? `Heure de fin invalide : « ${endRaw} » (format attendu 12:00)` : 'Heure de fin manquante');
          if (day && start && end) {
            if (start >= end) errors.push(`L'heure de fin (${end}) doit être après l'heure de début (${start})`);
            else {
              window = { day, start, end };
              if (!ref.grid.days.includes(day)) warnings.push(`${DAY_NAMES[day]} n'est pas un jour de cours de la grille`);
              else if (start < ref.grid.start || end > ref.grid.end) warnings.push(`Dépasse la journée de cours (${ref.grid.start}–${ref.grid.end})`);
              else if (gridIssue(day, start, end, ref.grid)?.includes('demi-journée libre')) warnings.push(`Couvre une demi-journée libre de la grille`);
            }
          }
        }

        const maxRaw = get(r, 'max');
        let max: number | null = null;
        if (maxRaw) {
          const h = parseHours(maxRaw);
          if (h == null) errors.push(`Volume hebdomadaire max invalide : « ${maxRaw} »`);
          else max = Math.round(h * 60);
        }

        if (!errors.length && teacher) {
          const key = teacher.id;
          const entry = teachers.get(key) ?? {
            teacherId: teacher.id,
            teacherName: teacher.name,
            matricule: matricule || teacher.matricule,
            weeklyMaxMinutes: null,
            qualifications: [],
            availability: [],
          };
          if (max != null) {
            if (entry.weeklyMaxMinutes != null && entry.weeklyMaxMinutes !== max) {
              warnings.push(`Volume max différent de la ligne ${entry.maxLine} : ${max / 60}h retenues`);
            }
            entry.weeklyMaxMinutes = max;
            entry.maxLine = line;
          }
          for (const subjectId of subjectIds) {
            for (const scope of scopes) {
              if (!entry.qualifications.some((q) => q.subjectId === subjectId && q.level === scope.level && q.classId === scope.classId)) {
                entry.qualifications.push({ subjectId, ...scope });
              }
            }
          }
          if (window) {
            const seen = windowsSeen.get(key) ?? [];
            const overlap = seen.find((w) => w.day === window!.day && w.start < window!.end && window!.start < w.end);
            if (overlap) {
              const same = overlap.start === window.start && overlap.end === window.end;
              warnings.push(
                same
                  ? `Disponibilité en double avec la ligne ${overlap.line}`
                  : `Chevauche la disponibilité de la ligne ${overlap.line} (${DAY_NAMES[overlap.day]} ${overlap.start}–${overlap.end}) : les deux plages sont fusionnées`,
              );
            }
            seen.push({ ...window, line });
            windowsSeen.set(key, seen);
            if (!overlap || overlap.start !== window.start || overlap.end !== window.end) {
              entry.availability.push({ dayOfWeek: window.day, startTime: window.start, endTime: window.end });
            }
          }
          teachers.set(key, entry);
        }
      } else {
        const levelRaw = get(r, 'level');
        const subjectRaw = get(r, 'subject');
        const level = levelRaw ? levelByKey.get(levelKey(levelRaw)) : undefined;
        if (!levelRaw) errors.push('Niveau manquant');
        else if (!level) errors.push(`Niveau inconnu : « ${levelRaw} » (niveaux de l'année : ${levels.join(', ')})`);
        const subject = subjectRaw ? subjectByKey.get(subjectKey(subjectRaw)) ?? subjectByKey.get(textKey(subjectRaw)) : undefined;
        if (!subjectRaw) errors.push('Matière manquante');
        else if (!subject) errors.push(`Matière inconnue : « ${subjectRaw} »`);
        const hoursRaw = get(r, 'hours');
        const hours = parseHours(hoursRaw);
        if (!hoursRaw) errors.push('Heures/semaine manquantes');
        else if (hours == null) errors.push(`Heures/semaine invalides : « ${hoursRaw} »`);
        const maxRaw = get(r, 'maxSession');
        const maxSession = maxRaw ? parseHours(maxRaw) : null;
        if (maxRaw && maxSession == null) errors.push(`Durée max d'une séance invalide : « ${maxRaw} »`);
        if (hours != null && maxSession != null && maxSession > hours) warnings.push(`La durée max d'une séance (${maxSession}h) dépasse le volume hebdomadaire (${hours}h)`);
        const coefRaw = get(r, 'coefficient');
        let coefficient: number | null = null;
        if (coefRaw) {
          const n = Number(coefRaw.replace(',', '.'));
          if (!Number.isInteger(n) || n < 1 || n > 20) errors.push(`Coefficient invalide : « ${coefRaw} » (entier de 1 à 20)`);
          else coefficient = n;
        }
        if (level && subject) {
          const key = `${level}|${subject.id}`;
          const dup = volumes.get(key);
          if (dup) errors.push(`Doublon : ${subject.name} en ${level} est déjà défini ligne ${dup.line}`);
          else if (!errors.length && hours != null) {
            volumes.set(key, {
              level,
              subjectId: subject.id,
              minutesPerWeek: Math.round(hours * 60),
              maxSessionMinutes: maxSession != null ? Math.round(maxSession * 60) : null,
              coefficient,
              line,
            });
          }
        }
      }

      rows.push({ sheet: kind, line, status: errors.length ? 'error' : warnings.length ? 'warning' : 'valid', errors, warnings, cells: r });
    });
  }

  const teacherList = [...teachers.values()].map(({ maxLine, ...t }) => (void maxLine, t));
  const volumeList = [...volumes.values()].map(({ line, ...v }) => (void line, v));
  return {
    sheets,
    rows,
    summary: {
      valid: rows.filter((r) => r.status === 'valid').length,
      warnings: rows.filter((r) => r.status === 'warning').length,
      errors: rows.filter((r) => r.status === 'error').length,
      teachers: teacherList.length,
      availabilities: teacherList.reduce((s, t) => s + t.availability.length, 0),
      qualifications: teacherList.reduce((s, t) => s + t.qualifications.length, 0),
      volumes: volumeList.length,
    },
    payload: { teachers: teacherList, volumes: volumeList },
  };
}

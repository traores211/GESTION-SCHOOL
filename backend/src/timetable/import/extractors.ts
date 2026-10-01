import { matchEntity } from './entity-matcher';
import {
  findDayInText,
  isBreakCell,
  looksLikeClass,
  looksLikePerson,
  looksLikeRoom,
  parseDay,
  parseHours,
  parseTime,
  parseTimeRange,
  textKey,
} from './normalize';
import { DraftRow, ExtractionMethod, KnownEntity, ParsedDocument, ParsedTable } from './types';

/** Names already known in the school: they let the extractors tell a teacher from a subject in a cell. */
export interface Vocabulary {
  classes: KnownEntity[];
  subjects: KnownEntity[];
  teachers: KnownEntity[];
  rooms: KnownEntity[];
}

type Fields = Pick<DraftRow, 'className' | 'subjectName' | 'teacherName' | 'roomName'>;

/**
 * A level ("6ème", "Tle", "CM2") optionally followed by a division ("A", "B2", "3"). Case-sensitive on
 * purpose so "6ème et" is not read as "6ème E"; explicit accent-aware boundaries since \b ignores "è".
 */
const CLASS_IN_TEXT =
  /(?<![\wÀ-ÿ])((?:\d{1,2}\s*(?:[iI][èeÈE][mM][eE]|[èeÈE][mM][eE]|[èeÈE])|1\s*(?:[èeÈE][rR][eE]|[rR][eE])|[Tt]erminale|TERMINALE|[Tt]le|TLE|[Ss]econde|SECONDE|2nde|2NDE|2de|C[PEM]\s*\d?)(?:[\s-]*(?:[A-Z]\d?|\d{1,2}))?)(?![\wÀ-ÿ])/;

/** Finds a class name inside a title such as "Emploi du temps - Classe de 6ème A". */
export function findClassInText(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(CLASS_IN_TEXT);
  return match && looksLikeClass(match[1]) ? match[1].trim() : null;
}

const known = (kind: 'class' | 'subject' | 'teacher' | 'room', value: string, vocab: Vocabulary, accept: string[]) => {
  const list = { class: vocab.classes, subject: vocab.subjects, teacher: vocab.teachers, room: vocab.rooms }[kind];
  return list.length > 0 && accept.includes(matchEntity(kind, value, list).status);
};

/**
 * Splits a cell such as "Maths / M. Kouassi (S12)" and decides what each fragment is. Known names
 * win; patterns (titles, "Salle …", "6e A") come next; leftovers are assigned but flagged.
 */
export function classifyFragments(text: string, vocab: Vocabulary): { fields: Partial<Fields>; issues: string[] } {
  const parts = text
    .split(/\n|\/|\||;|\(|\)|\s[-–—]\s|,/)
    .map((p) => p.trim())
    .filter((p) => p && !parseTimeRange(p, true) && !isBreakCell(p));
  const fields: Partial<Fields> = {};
  const unknown: string[] = [];
  const issues: string[] = [];

  for (const part of parts) {
    if (!fields.roomName && (looksLikeRoom(part) || known('room', part, vocab, ['exact']))) fields.roomName = part;
    else if (!fields.teacherName && (looksLikePerson(part) || known('teacher', part, vocab, ['exact', 'probable']))) fields.teacherName = part;
    else if (!fields.className && (looksLikeClass(part) || known('class', part, vocab, ['exact']))) fields.className = part;
    else if (!fields.subjectName && known('subject', part, vocab, ['exact', 'probable'])) fields.subjectName = part;
    else unknown.push(part);
  }
  for (const part of unknown) {
    if (!fields.subjectName) {
      fields.subjectName = part;
      if (vocab.subjects.length) issues.push(`« ${part} » interprété comme matière`);
    } else if (!fields.teacherName) {
      fields.teacherName = part;
      issues.push(`« ${part} » interprété comme enseignant`);
    } else issues.push(`Texte non interprété : « ${part} »`);
  }
  return { fields, issues };
}

// ------------------------------------------------------------------ list layout (one lesson per row)

type Column = 'day' | 'time' | 'start' | 'end' | 'class' | 'subject' | 'teacher' | 'room' | 'hours';

const HEADERS: [Column, string[]][] = [
  ['hours', ['volume horaire', 'volume', 'heures semaine', 'h sem', 'heures hebdo', 'nb heures', 'nombre d heures', 'hours per week', 'hours']],
  ['start', ['heure de debut', 'heure debut', 'debut', 'start', 'from', 'de']],
  ['end', ['heure de fin', 'heure fin', 'fin', 'end', 'to', 'a']],
  ['time', ['horaire', 'horaires', 'heure', 'heures', 'creneau', 'plage horaire', 'plage', 'time', 'slot']],
  ['day', ['jour', 'jours', 'day', 'journee']],
  ['class', ['classe', 'classes', 'class', 'niveau classe', 'division', 'groupe']],
  ['subject', ['matiere', 'matieres', 'discipline', 'cours', 'subject', 'enseignement', 'module']],
  ['teacher', ['enseignant', 'enseignants', 'professeur', 'prof', 'formateur', 'teacher', 'intervenant', 'nom du professeur']],
  ['room', ['salle', 'salles', 'local', 'room', 'lieu', 'salle de classe']],
];

function headerColumn(cell: string): Column | null {
  const key = textKey(cell);
  if (!key) return null;
  for (const [column, words] of HEADERS) if (words.includes(key)) return column;
  for (const [column, words] of HEADERS) if (words.some((w) => w.length > 3 && key.startsWith(w))) return column;
  return null;
}

function mapHeader(row: string[]): Map<Column, number> {
  const map = new Map<Column, number>();
  row.forEach((cell, i) => {
    const column = headerColumn(cell);
    if (column && !map.has(column)) map.set(column, i);
  });
  return map;
}

function isListHeader(map: Map<Column, number>) {
  const hasWho = map.has('subject') || map.has('class') || map.has('teacher');
  const hasWhen = map.has('day') || map.has('time') || map.has('start') || map.has('hours');
  return map.size >= 2 && hasWho && hasWhen;
}

export function extractList(table: ParsedTable, vocab: Vocabulary, nextId: () => string): DraftRow[] | null {
  const headerIndex = table.rows.slice(0, 10).findIndex((r) => isListHeader(mapHeader(r)));
  if (headerIndex < 0) return null;
  const map = mapHeader(table.rows[headerIndex]);
  const cell = (row: string[], c: Column) => (map.has(c) ? row[map.get(c)!] ?? '' : '');
  const tableClass = findClassInText(table.name);
  const rows: DraftRow[] = [];

  table.rows.slice(headerIndex + 1).forEach((row, i) => {
    if (row.every((c) => !c) || isListHeader(mapHeader(row))) return;
    const issues: string[] = [];
    const dayText = cell(row, 'day');
    const dayOfWeek = parseDay(dayText) ?? (dayText ? findDayInText(dayText) : null);
    let range = parseTimeRange(cell(row, 'time')) ?? parseTimeRange(dayText, true);
    if (!range && (map.has('start') || map.has('end'))) {
      const start = parseTime(cell(row, 'start'));
      const end = parseTime(cell(row, 'end'));
      if (start && end && start < end) range = { start, end };
      else if (cell(row, 'start') || cell(row, 'end')) issues.push(`Horaire non reconnu : « ${cell(row, 'start')} – ${cell(row, 'end')} »`);
    }
    const hoursPerWeek = parseHours(cell(row, 'hours'));
    const isRequirement = !dayOfWeek && !range && hoursPerWeek !== null;

    if (!isRequirement) {
      if (!dayOfWeek) issues.push(dayText ? `Jour non reconnu : « ${dayText} »` : 'Jour manquant');
      if (!range && !issues.some((x) => x.startsWith('Horaire'))) {
        issues.push(cell(row, 'time') ? `Horaire non reconnu : « ${cell(row, 'time')} »` : 'Horaire manquant');
      }
    }

    const className = cell(row, 'class') || tableClass;
    if (!className) issues.push('Classe manquante');
    const subjectName = cell(row, 'subject') || null;
    if (!subjectName) issues.push('Matière manquante');

    rows.push({
      id: nextId(),
      dayOfWeek,
      startTime: range?.start ?? null,
      endTime: range?.end ?? null,
      className: className || null,
      subjectName,
      teacherName: cell(row, 'teacher') || null,
      roomName: cell(row, 'room') || null,
      hoursPerWeek: isRequirement ? hoursPerWeek : null,
      source: `${table.name ? `« ${table.name} », ` : ''}ligne ${headerIndex + i + 2}`,
      raw: row.filter(Boolean).join(' | '),
      method: 'list',
      issues,
    });
  });
  return rows;
}

// ------------------------------------------------------------------ grid layout (days × time slots)

function transpose(rows: string[][]): string[][] {
  const width = Math.max(...rows.map((r) => r.length));
  return Array.from({ length: width }, (_, c) => rows.map((r) => r[c] ?? ''));
}

function findDayHeader(rows: string[][]) {
  return rows.slice(0, 15).findIndex((r) => r.filter((c) => parseDay(c)).length >= 2);
}

export function extractGrid(table: ParsedTable, vocab: Vocabulary, nextId: () => string): DraftRow[] | null {
  let rows = table.rows;
  let headerIndex = findDayHeader(rows);
  if (headerIndex < 0) {
    // Days down the first column, time slots across: read it transposed.
    const t = transpose(rows);
    const h = findDayHeader(t);
    if (h < 0) return null;
    rows = t;
    headerIndex = h;
  }
  const header = rows[headerIndex];
  const dayCols = new Map<number, number>();
  header.forEach((c, i) => {
    const d = parseDay(c);
    if (d) dayCols.set(i, d);
  });

  // Time column: the non-day column where most rows below the header hold a time.
  const body = rows.slice(headerIndex + 1);
  const width = Math.max(...rows.map((r) => r.length));
  let timeCol = -1;
  let bestHits = 0;
  for (let c = 0; c < width; c++) {
    if (dayCols.has(c)) continue;
    const hits = body.filter((r) => parseTimeRange(r[c] ?? '') || parseTime(r[c] ?? '')).length;
    if (hits > bestHits) {
      bestHits = hits;
      timeCol = c;
    }
  }
  if (timeCol < 0 || bestHits === 0) return null;

  // Time slots; rows without a time label continue the previous slot (multi-line cells in PDFs/OCR).
  interface Slot {
    start: string | null;
    end: string | null;
    label: string;
    cells: Map<number, string>;
    line: number;
  }
  const slots: Slot[] = [];
  body.forEach((r, i) => {
    const label = r[timeCol] ?? '';
    const range = parseTimeRange(label);
    const single = range ? null : parseTime(label);
    const cells = new Map<number, string>();
    for (const c of dayCols.keys()) if (r[c]) cells.set(c, r[c]);
    if (range || single) {
      slots.push({ start: range?.start ?? single, end: range?.end ?? null, label, cells, line: headerIndex + i + 2 });
    } else if (slots.length) {
      const prev = slots[slots.length - 1];
      for (const [c, text] of cells) prev.cells.set(c, prev.cells.has(c) ? `${prev.cells.get(c)}\n${text}` : text);
    }
  });
  // Single times ("08:00") end where the next slot starts.
  slots.forEach((s, i) => {
    if (!s.end && slots[i + 1]?.start && slots[i + 1].start! > s.start!) s.end = slots[i + 1].start;
  });

  const context = table.name ?? '';
  const gridClass = findClassInText(context) ?? findClassInText(rows.slice(0, headerIndex).flat().join(' ')) ?? findClassInText(header[timeCol]);
  const gridTeacher = !gridClass && context && known('teacher', context, vocab, ['exact', 'probable']) ? context : null;
  const gridRoom = !gridClass && context && known('room', context, vocab, ['exact']) ? context : null;

  const result: DraftRow[] = [];
  for (const [col, day] of dayCols) {
    let open: DraftRow | null = null;
    let openText = '';
    for (const slot of slots) {
      const text = slot.cells.get(col) ?? '';
      if (open && text === openText && open.endTime === slot.start && slot.end) {
        open.endTime = slot.end; // same lesson over consecutive slots (merged cells)
        continue;
      }
      open = null;
      if (!text || isBreakCell(text)) continue;
      const { fields, issues } = classifyFragments(text, vocab);
      if (!slot.end) issues.push(`Heure de fin inconnue pour « ${slot.label} »`);
      const className = fields.className ?? gridClass;
      if (!className) issues.push('Classe non détectée : indiquez-la');
      open = {
        id: nextId(),
        dayOfWeek: day,
        startTime: slot.start,
        endTime: slot.end,
        className: className ?? null,
        subjectName: fields.subjectName ?? null,
        teacherName: fields.teacherName ?? gridTeacher,
        roomName: fields.roomName ?? gridRoom,
        hoursPerWeek: null,
        source: `${table.name ? `« ${table.name} », ` : ''}${header[col]} ${slot.label}`,
        raw: text.replace(/\n/g, ' / '),
        method: 'grid',
        issues,
      };
      openText = text;
      result.push(open);
    }
  }
  return result.sort((a, b) => (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

// ------------------------------------------------------------------ free text (one lesson per line)

const HOURS_PER_WEEK = /(\d{1,2}(?:[.,]\d+)?)\s*h(?:eures?)?\s*(?:\/|par|per)\s*sem(?:aine)?/i;

export function extractText(text: string, vocab: Vocabulary, nextId: () => string): DraftRow[] {
  const rows: DraftRow[] = [];
  let currentDay: number | null = null;
  let currentClass: string | null = null;
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/\t/g, ' | ').trim();
    if (!line) return;
    const classInLine = findClassInText(line);
    const range = parseTimeRange(line, true);
    const day = findDayInText(line);
    const weekly = line.match(HOURS_PER_WEEK);

    if (!range && !weekly) {
      if (day) currentDay = day;
      if (classInLine && /classe|emploi|class|niveau/i.test(line)) currentClass = classInLine;
      else if (classInLine && line.length <= 12) currentClass = classInLine;
      return;
    }
    if (day) currentDay = day;
    let rest = line.replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi, ' ');
    if (range) rest = rest.replace(/(\d{1,2})\s*(?:[h:.]\s*(\d{2})?)?\s*(?:-|–|—|à|a|au|to|>|\/)\s*(\d{1,2})\s*(?:[h:.]\s*(\d{2})?)?/i, ' ');
    if (weekly) rest = rest.replace(HOURS_PER_WEEK, ' ');
    rest = rest.replace(/^[\s:|,-]+|[\s:|,-]+$/g, '');
    // "Maths M. Kouassi Salle 12": cut before titles and room words so each part can be classified.
    rest = rest.replace(/\s+(?=(?:M\.|Mme\.?|Mlle\.?|Mr\.?|Prof\.?|Salle|Labo|Amphi)\s)/g, ' / ');
    const { fields, issues } = classifyFragments(rest.replace(/\s{2,}|\s:\s/g, ' | ').replace(/\|/g, '/'), vocab);
    const className = fields.className ?? currentClass;
    const isRequirement = !range && !!weekly;
    if (!isRequirement && !currentDay) issues.push('Jour non détecté');
    if (!className) issues.push('Classe non détectée : indiquez-la');
    rows.push({
      id: nextId(),
      dayOfWeek: isRequirement ? null : currentDay,
      startTime: range?.start ?? null,
      endTime: range?.end ?? null,
      className: className ?? null,
      subjectName: fields.subjectName ?? null,
      teacherName: fields.teacherName ?? null,
      roomName: fields.roomName ?? null,
      hoursPerWeek: isRequirement ? parseHours(`${weekly![1]}h`) : null,
      source: `ligne ${index + 1}`,
      raw: line,
      method: 'text',
      issues,
    });
  });
  return rows;
}

// ------------------------------------------------------------------ orchestration

/** Tries the structured layouts on every table, then falls back to line-by-line text. */
export function extractRows(doc: ParsedDocument, vocab: Vocabulary): { rows: DraftRow[]; method: ExtractionMethod | null } {
  let counter = 0;
  const nextId = () => `r${++counter}`;
  const rows: DraftRow[] = [];
  const methods = new Set<ExtractionMethod>();
  for (const table of doc.tables) {
    const list = extractList(table, vocab, nextId);
    if (list && list.length) {
      rows.push(...list);
      methods.add('list');
      continue;
    }
    const grid = extractGrid(table, vocab, nextId);
    if (grid && grid.length) {
      rows.push(...grid);
      methods.add('grid');
    }
  }
  if (!rows.length && doc.text.trim()) {
    const fromText = extractText(doc.text, vocab, nextId);
    if (fromText.length) {
      rows.push(...fromText);
      methods.add('text');
    }
  }
  if (doc.kind === 'image') for (const r of rows) r.issues.unshift('Lu par OCR : vérifiez');
  return { rows, method: methods.size ? [...methods][0] : null };
}

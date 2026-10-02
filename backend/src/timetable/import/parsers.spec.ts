import { buildCsv, buildDocx, buildPdf, buildXlsx, GRID } from '../../../test/fixtures';
import { detectFileKind, UnsupportedFileError } from './file-type';
import { extractRows, Vocabulary } from './extractors';
import { CsvParser, parseDelimited } from './parsers/csv.parser';
import { DocxParser } from './parsers/docx.parser';
import { PdfParser } from './parsers/pdf.parser';
import { XlsxParser } from './parsers/xlsx.parser';
import { DraftRow } from './types';

const vocab: Vocabulary = {
  classes: [{ id: 'c6', name: '6ème A' }, { id: 'c5', name: '5ème A' }],
  subjects: ['Mathématiques', 'Français', 'Anglais', 'SVT', 'EPS', 'Histoire-Géographie'].map((name, i) => ({ id: `s${i}`, name })),
  teachers: [{ id: 't1', name: 'Kouassi Aya' }, { id: 't2', name: 'Diallo Yacouba' }, { id: 't3', name: 'Koné Aminata' }],
  rooms: [{ id: 'r1', name: 'Salle 12' }],
};

const summary = (rows: DraftRow[]) =>
  rows.map((r) => `${r.dayOfWeek} ${r.startTime}-${r.endTime} ${r.className} | ${r.subjectName} | ${r.teacherName ?? '-'} | ${r.roomName ?? '-'}`);

/** Expected lessons of the GRID fixture (the merged Monday cell is one 2-hour lesson, breaks skipped). */
const GRID_LESSONS = [
  '1 08:00-10:00 6ème A | Maths | M. Kouassi | Salle 12',
  '1 10:15-11:15 6ème A | EPS | - | -',
  '2 08:00-09:00 6ème A | Français | Diallo Yacouba | -',
  '2 09:00-10:00 6ème A | SVT | - | Labo',
  '2 10:15-11:15 6ème A | Histoire-Géo | Diallo Yacouba | Salle 12',
  '3 08:00-09:00 6ème A | Anglais | Koné Aminata | Salle 3',
  '3 10:15-11:15 6ème A | Maths | Kouassi Aya | -',
];

describe('file type detection', () => {
  it('uses content, not the extension', async () => {
    expect(detectFileKind(await buildXlsx(), 'renamed.pdf').kind).toBe('xlsx');
    expect(detectFileKind(await buildDocx(), 'x.docx').kind).toBe('docx');
    expect(detectFileKind(await buildPdf(), 'x.bin').kind).toBe('pdf');
    expect(detectFileKind(buildCsv(), 'x.csv').kind).toBe('csv');
    expect(detectFileKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), 'x').kind).toBe('image');
  });

  it('explains unsupported formats', () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(() => detectFileKind(ole, 'old.xls')).toThrow(/Ancien format Office/);
    expect(() => detectFileKind(Buffer.alloc(0), 'x')).toThrow(UnsupportedFileError);
    expect(() => detectFileKind(Buffer.from([0, 1, 2, 3, 250, 251, 0, 9]), 'x.exe')).toThrow(/Format non reconnu/);
  });
});

describe('CSV', () => {
  it('handles quotes, BOM, delimiters and Windows-1252', async () => {
    expect(parseDelimited('a;"b;c";"d ""e"""\r\n1;2;3')).toEqual([
      ['a', 'b;c', 'd "e"'],
      ['1', '2', '3'],
    ]);
    expect(parseDelimited('a,b,c\n1,2,3')[1]).toEqual(['1', '2', '3']);
    const latin = Buffer.from([0x4a, 0x6f, 0x75, 0x72, 0x3b, 0x4d, 0x61, 0x74, 0x69, 0xe8, 0x72, 0x65, 0x0a, 0x4c, 0x75, 0x6e, 0x64, 0x69, 0x3b, 0x78]);
    const doc = await new CsvParser().parse(latin, { kind: 'csv', mime: 'text/csv', label: 'CSV' });
    expect(doc.tables[0].rows[0]).toEqual(['Jour', 'Matière']);
  });

  it('extracts list rows and reports the invalid ones', async () => {
    const doc = await new CsvParser().parse(buildCsv(), { kind: 'csv', mime: 'text/csv', label: 'CSV' });
    const { rows, method } = extractRows(doc, vocab);
    expect(method).toBe('list');
    expect(summary(rows)).toEqual([
      '1 08:00-10:00 5ème A | Mathématiques | Kouassi Aya | Salle 12',
      '2 10:00-11:00 5ème A | Anglais | Koné Aminata | Salle 3',
      '4 14:00-16:00 4ème A | SVT | - | Labo SVT',
    ]);
    expect(rows.every((r) => r.issues.length === 0)).toBe(true);
  });

  it('keeps weekly volumes as requirements', () => {
    const { rows } = extractRows(
      { kind: 'csv', tables: [{ rows: [['Classe', 'Matière', 'Volume horaire'], ['6e A', 'Maths', '4h']] }], text: '', warnings: [] },
      vocab,
    );
    expect(rows[0]).toMatchObject({ className: '6e A', subjectName: 'Maths', hoursPerWeek: 4, dayOfWeek: null, issues: [] });
  });
});

describe('Excel', () => {
  it('reads the grid sheet (merged cells, breaks) and the list sheet (Excel time values)', async () => {
    const doc = await new XlsxParser().parse(await buildXlsx(), { kind: 'xlsx', mime: '', label: '' });
    expect(doc.tables.map((t) => t.name)).toEqual(['6e A', 'Liste']);
    const { rows } = extractRows(doc, vocab);
    // The sheet name ("6e A") names the class; the matcher later maps it to "6ème A".
    expect(summary(rows.filter((r) => r.method === 'grid'))).toEqual(GRID_LESSONS.map((l) => l.replace('6ème A', '6e A')));
    const list = rows.filter((r) => r.method === 'list');
    expect(list[1]).toMatchObject({ dayOfWeek: 2, startTime: '10:00', endTime: '11:00' });
  });
});

describe('Word', () => {
  it('reads the table and takes the class from the heading above it', async () => {
    const doc = await new DocxParser().parse(await buildDocx(), { kind: 'docx', mime: '', label: '' });
    expect(doc.tables[0].name).toContain(GRID.className);
    const { rows, method } = extractRows(doc, vocab);
    expect(method).toBe('grid');
    // Word has no merged cell here: Monday Maths is read as two consecutive identical cells and merged.
    expect(summary(rows)).toEqual(GRID_LESSONS);
  });
});

describe('PDF', () => {
  it('rebuilds the grid from text positions', async () => {
    const doc = await new PdfParser().parse(await buildPdf(), { kind: 'pdf', mime: 'application/pdf', label: 'PDF' });
    const { rows, method } = extractRows(doc, vocab);
    expect(method).toBe('grid');
    expect(summary(rows)).toEqual(GRID_LESSONS);
  });
});

describe('free text', () => {
  it('reads one lesson per line with day and class context', () => {
    const text = ['EMPLOI DU TEMPS — Classe : 5ème A', 'LUNDI', '08h00 - 10h00 Mathématiques M. Kouassi Salle 12', '10h-11h : Anglais / Koné Aminata', 'Mardi 8h-9h SVT'].join('\n');
    const { rows, method } = extractRows({ kind: 'text', tables: [], text, warnings: [] }, vocab);
    expect(method).toBe('text');
    expect(summary(rows)).toEqual([
      '1 08:00-10:00 5ème A | Mathématiques | M. Kouassi | Salle 12',
      '1 10:00-11:00 5ème A | Anglais | Koné Aminata | -',
      '2 08:00-09:00 5ème A | SVT | - | -',
    ]);
  });
});

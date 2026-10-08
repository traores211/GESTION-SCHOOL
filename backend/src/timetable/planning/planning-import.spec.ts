import { TEACHER_HEADERS, VOLUME_HEADERS, analyzePlanningTables, ImportReference } from './planning-import';
import { makeGrid } from '../domain/planning.fixtures';

const ref: ImportReference = {
  classes: [
    { id: 'c6a', name: '6ème A', level: '6ème' },
    { id: 'c6b', name: '6ème B', level: '6ème' },
    { id: 'c3a', name: '3ème A', level: '3ème' },
  ],
  subjects: [
    { id: 'math', name: 'Mathématiques', code: 'MATH' },
    { id: 'pc', name: 'Physique-Chimie', code: 'PC' },
  ],
  teachers: [
    { id: 't1', name: 'Koffi Kouassi', firstName: 'Koffi', lastName: 'Kouassi', matricule: 'ENS-001' },
    { id: 't2', name: 'Awa Traoré', firstName: 'Awa', lastName: 'Traoré', matricule: null },
  ],
  grid: makeGrid(),
};

const teachers = (rows: string[][]) => ({ name: 'Professeurs', rows: [TEACHER_HEADERS, ...rows] });
const volumes = (rows: string[][]) => ({ name: 'Volumes horaires officiels', rows: [VOLUME_HEADERS, ...rows] });

describe('planning file analysis', () => {
  it('builds qualifications, merged availability and teacher load from valid rows', () => {
    const report = analyzePlanningTables(
      [
        teachers([
          ['ENS-001', 'Kouassi', 'Koffi', 'Maths, PC', '6ème, 3ème A', 'Lundi', '08:00', '12:15', '18'],
          ['ENS-001', 'Kouassi', 'Koffi', 'Maths', '6ème', 'Mardi', '8h', '10h', ''],
          ['', 'Traoré', 'Awa', 'Physique-Chimie', '3ème', 'Jeudi', '14:00', '17:00', ''],
        ]),
        volumes([
          ['6ème', 'Mathématiques', '4', '2', '4'],
          ['6e', 'PC', '2h', '', ''],
        ]),
      ],
      ref,
    );
    expect(report.summary).toMatchObject({ errors: 0, teachers: 2, volumes: 2 });
    const t1 = report.payload.teachers.find((t) => t.teacherId === 't1')!;
    expect(t1.weeklyMaxMinutes).toBe(18 * 60);
    expect(t1.qualifications).toEqual(
      expect.arrayContaining([
        { subjectId: 'math', level: '6ème', classId: null },
        { subjectId: 'pc', level: '3ème', classId: 'c3a' },
      ]),
    );
    expect(t1.availability).toEqual([
      { dayOfWeek: 1, startTime: '08:00', endTime: '12:15' },
      { dayOfWeek: 2, startTime: '08:00', endTime: '10:00' },
    ]);
    // Matched by name when the staff number is missing; the level "6e" matches "6ème".
    expect(report.payload.teachers.find((t) => t.teacherId === 't2')).toBeTruthy();
    expect(report.payload.volumes).toContainEqual({ level: '6ème', subjectId: 'pc', minutesPerWeek: 120, maxSessionMinutes: null, coefficient: null });
  });

  it('reports each invalid line with a precise reason and keeps it out of the payload', () => {
    const report = analyzePlanningTables(
      [
        teachers([
          ['ENS-404', 'Inconnu', 'Paul', 'Maths', '6ème', 'Lundi', '08:00', '10:00', ''],
          ['ENS-001', '', '', 'Chimie quantique', '7ème', 'Funday', '10:00', '08:00', 'beaucoup'],
          ['ENS-002', 'Kouassi', 'Koffi', 'Maths', '6ème', 'Lundi', '08:00', '09:00', ''],
        ]),
        volumes([
          ['5ème', 'Mathématiques', '4', '', ''],
          ['6ème', 'Mathématiques', 'quatre', '', '30'],
          ['6ème', 'Mathématiques', '4', '', ''],
          ['6ème', 'Mathématiques', '5', '', ''],
        ]),
      ],
      ref,
    );
    const errorsOf = (sheet: string, line: number) => report.rows.find((r) => r.sheet === sheet && r.line === line)!.errors.join(' | ');
    expect(errorsOf('teachers', 2)).toMatch(/Enseignant inconnu \(matricule ENS-404, Paul Inconnu\)/);
    const second = errorsOf('teachers', 3);
    expect(second).toMatch(/Matière inconnue : « Chimie quantique »/);
    expect(second).toMatch(/Niveau ou classe inconnu : « 7ème »/);
    expect(second).toMatch(/Jour invalide : « Funday »/);
    expect(second).toMatch(/Volume hebdomadaire max invalide/);
    expect(errorsOf('teachers', 4)).toMatch(/ne correspond pas à Koffi Kouassi/);
    expect(errorsOf('volumes', 2)).toMatch(/Niveau inconnu : « 5ème »/);
    expect(errorsOf('volumes', 3)).toMatch(/Heures\/semaine invalides.*Coefficient invalide/);
    expect(errorsOf('volumes', 5)).toMatch(/Doublon : Mathématiques en 6ème est déjà défini ligne 4/);
    expect(report.summary.errors).toBe(6);
    expect(report.payload.teachers).toEqual([]);
    expect(report.payload.volumes).toHaveLength(1);
  });

  it('warns about overlapping or duplicate availability and lines outside the grid', () => {
    const report = analyzePlanningTables(
      [
        teachers([
          ['ENS-001', 'Kouassi', 'Koffi', 'Maths', '6ème', 'Lundi', '08:00', '11:00', ''],
          ['ENS-001', 'Kouassi', 'Koffi', 'Maths', '6ème', 'Lundi', '10:00', '12:00', ''],
          ['ENS-001', 'Kouassi', 'Koffi', 'Maths', '6ème', 'Lundi', '08:00', '11:00', ''],
          ['ENS-001', 'Kouassi', 'Koffi', 'Maths', '6ème', 'Samedi', '08:00', '11:00', ''],
          ['ENS-001', 'Kouassi', 'Koffi', 'Maths', '6ème', '', '', '', ''],
        ]),
      ],
      ref,
    );
    const warnings = report.rows.map((r) => r.warnings.join(' | '));
    expect(warnings[1]).toMatch(/Chevauche la disponibilité de la ligne 2/);
    expect(warnings[2]).toMatch(/Disponibilité en double avec la ligne 2/);
    expect(warnings[3]).toMatch(/Samedi n'est pas un jour de cours/);
    expect(warnings[4]).toMatch(/habilitations seulement/);
    expect(report.summary.errors).toBe(0);
  });

  it('recognises the sheets of a CSV export by their headers', () => {
    const csv = { name: 'export.csv', rows: [['Niveau', 'Matière', 'Heures par semaine'], ['3ème', 'PC', '2']] };
    const report = analyzePlanningTables([csv], ref);
    expect(report.sheets.volumes).toBe('export.csv');
    expect(report.payload.volumes).toHaveLength(1);
  });
});

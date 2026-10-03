import { IMPORT_SPECS, isEmail, key, mapHeaders, parseAmount, parseDate, parseGender, parseGradeType, parseRole, parseScore, personKey, readRows, templateCsv } from './import-rules';
import { parseDelimited } from '../timetable/import/parsers/csv.parser';

describe('column recognition', () => {
  it('compares headers without accents, case or punctuation', () => {
    expect(key('N° Matricule')).toBe('n matricule');
    expect(key('  Date de  Naissance ')).toBe('date de naissance');
    expect(key('E-mail du responsable')).toBe('e mail du responsable');
  });

  it('maps the usual headers of a school spreadsheet', () => {
    const mapping = mapHeaders(['NOM', 'Prénom', 'Né le', 'Sexe', 'CLASSE', 'Tel parent', 'Observations'], IMPORT_SPECS.students.columns);
    expect(mapping.columns).toMatchObject({ lastName: 0, firstName: 1, dateOfBirth: 2, gender: 3, className: 4, guardianPhone: 5 });
    expect(mapping.missing).toEqual([]);
    expect(mapping.ignored).toEqual(['Observations']);
  });

  it('reports the required columns that are absent', () => {
    expect(mapHeaders(['Nom', 'Classe'], IMPORT_SPECS.students.columns).missing).toEqual(['Prénoms', 'Date de naissance', 'Sexe']);
  });

  it('prefers the exact header over an alias', () => {
    // "Nom" is the pupil, "Nom du responsable" the guardian, whatever the order of the columns.
    const mapping = mapHeaders(['Nom du responsable', 'Nom', 'Prénoms', 'Date de naissance', 'Sexe'], IMPORT_SPECS.students.columns);
    expect(mapping.columns.lastName).toBe(1);
    expect(mapping.columns.guardianLastName).toBe(0);
  });

  it('reads rows with their line number in the file', () => {
    const table = parseDelimited('Nom;Prénoms;Date de naissance;Sexe\nKONÉ;Awa;15/06/2013;F\nYAO;Koffi;;M\n');
    const rows = readRows(table, mapHeaders(table[0], IMPORT_SPECS.students.columns));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ line: 3, values: { lastName: 'YAO', firstName: 'Koffi', dateOfBirth: '', gender: 'M' } });
  });
});

describe('cell parsing', () => {
  it('reads French and ISO dates and refuses impossible ones', () => {
    expect(parseDate('15/06/2013')?.toISOString()).toBe('2013-06-15T00:00:00.000Z');
    expect(parseDate('5-6-13')?.toISOString()).toBe('2013-06-05T00:00:00.000Z');
    expect(parseDate('2013-06-15')?.toISOString()).toBe('2013-06-15T00:00:00.000Z');
    expect(parseDate('01.09.98')?.getUTCFullYear()).toBe(1998);
    expect(parseDate('31/02/2013')).toBeNull();
    expect(parseDate('juin 2013')).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('reads genders as schools write them', () => {
    expect(['M', 'Garçon', 'masculin', 'G'].map(parseGender)).toEqual(['M', 'M', 'M', 'M']);
    expect(['F', 'Fille', 'Féminin'].map(parseGender)).toEqual(['F', 'F', 'F']);
    expect(parseGender('X')).toBeNull();
  });

  it('reads amounts in whole francs', () => {
    expect(parseAmount('150 000')).toBe(150000);
    expect(parseAmount('150.000 FCFA')).toBe(150000);
    expect(parseAmount('75000,00')).toBe(75000);
    expect(parseAmount('1,250,000')).toBe(1250000);
    expect(parseAmount('12,5')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('gratuit')).toBeNull();
  });

  it('reads marks with a comma and an optional scale', () => {
    expect(parseScore('14,5')).toEqual({ score: 14.5, maxScore: undefined });
    expect(parseScore('7/10')).toEqual({ score: 7, maxScore: 10 });
    expect(parseScore('abs')).toBeNull();
  });

  it('reads roles and evaluation types, with a default when empty', () => {
    expect(parseRole('')).toBe('ENSEIGNANT');
    expect(parseRole('Professeur de SVT')).toBe('ENSEIGNANT');
    expect(parseRole('Secrétaire')).toBe('SECRETARY');
    expect(parseRole('Directrice des études')).toBe('DIRECTOR');
    expect(parseRole('Jardinier')).toBeNull();
    expect(parseGradeType('')).toBe('DEVOIR');
    expect(parseGradeType('Composition')).toBe('COMPOSITION');
    expect(parseGradeType('quiz')).toBeNull();
  });

  it('checks e-mail addresses and identity keys', () => {
    expect(isEmail('k.kouassi@ecole.ci')).toBe(true);
    expect(isEmail('k.kouassi@ecole')).toBe(false);
    expect(personKey('KONÉ', 'Awa', parseDate('15/06/2013'))).toBe(personKey('Kone', ' awa ', parseDate('2013-06-15')));
  });
});

describe('templates', () => {
  it('produces an Excel-friendly CSV that maps back to every column', () => {
    for (const kind of ['students', 'staff', 'balances', 'grades'] as const) {
      const csv = templateCsv(kind);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const table = parseDelimited(csv);
      const mapping = mapHeaders(table[0], IMPORT_SPECS[kind].columns);
      expect(mapping.missing).toEqual([]);
      expect(mapping.ignored).toEqual([]);
      expect(Object.keys(mapping.columns)).toHaveLength(IMPORT_SPECS[kind].columns.length);
    }
  });
});

import { distance, matchPupil, matchSheetLines, parseRollCall, parseSpokenMarks, parseSpokenNumber } from './smart-entry-rules';

const roster = [
  { id: 'alice', firstName: 'Alice', lastName: 'Kouassi' },
  { id: 'paul', firstName: 'Paul', lastName: 'Yao' },
  { id: 'marc', firstName: 'Marc', lastName: 'Traoré' },
  { id: 'awa1', firstName: 'Awa', lastName: 'Koné' },
  { id: 'awa2', firstName: 'Awa', lastName: 'Bamba' },
];

describe('matching a name to the class', () => {
  it('finds a pupil by full name, in either order, without accents', () => {
    expect(matchPupil('Alice Kouassi', roster)).toMatchObject({ studentId: 'alice', confidence: 'SURE' });
    expect(matchPupil('TRAORE Marc', roster)).toMatchObject({ studentId: 'marc', confidence: 'SURE' });
  });

  it('accepts a first name alone when it is unique in the class', () => {
    expect(matchPupil('Paul', roster)).toMatchObject({ studentId: 'paul', confidence: 'SURE' });
  });

  it('never chooses between two pupils with the same name', () => {
    const m = matchPupil('Awa', roster);
    expect(m.studentId).toBeNull();
    expect(m.issue).toContain('Plusieurs élèves');
    expect(matchPupil('Awa Bamba', roster)).toMatchObject({ studentId: 'awa2', confidence: 'SURE' });
  });

  it('forgives one misheard letter but asks for a check', () => {
    expect(distance('kouasi', 'kouassi')).toBe(1);
    expect(matchPupil('Alice Kouasi', roster)).toMatchObject({ studentId: 'alice', confidence: 'A_VERIFIER' });
  });

  it('flags a name that is not in the class', () => {
    expect(matchPupil('Fatou Diallo', roster)).toMatchObject({ studentId: null, confidence: 'INCONNU' });
    expect(matchPupil('  ', roster).studentId).toBeNull();
  });
});

describe('spoken roll call', () => {
  it('reads present, absent and late', () => {
    const rows = parseRollCall('Alice Kouassi présente. Paul Yao absent. Marc Traoré en retard', roster);
    expect(rows.map((r) => [r.studentId, r.status])).toEqual([['alice', 'PRESENT'], ['paul', 'ABSENT'], ['marc', 'RETARD']]);
    expect(rows.every((r) => r.confidence === 'SURE')).toBe(true);
  });

  it('keeps an unknown name as a row to check instead of dropping it', () => {
    const rows = parseRollCall('Fatou Diallo absente, Paul présent', roster);
    expect(rows[0]).toMatchObject({ studentId: null, status: 'ABSENT', confidence: 'INCONNU' });
    expect(rows[1]).toMatchObject({ studentId: 'paul', status: 'PRESENT' });
  });

  it('flags a pupil named twice', () => {
    const rows = parseRollCall('Paul présent Paul absent', roster);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.confidence === 'A_VERIFIER' && /plusieurs fois/.test(r.issue ?? ''))).toBe(true);
  });

  it('returns nothing for a sentence without any status', () => {
    expect(parseRollCall('bonjour à tous', roster)).toEqual([]);
  });
});

describe('spoken numbers', () => {
  it('reads digits, decimals and French words', () => {
    expect(parseSpokenNumber('15')).toBe(15);
    expect(parseSpokenNumber('12,5')).toBe(12.5);
    expect(parseSpokenNumber('12 virgule 5')).toBe(12.5);
    expect(parseSpokenNumber('quinze')).toBe(15);
    expect(parseSpokenNumber('dix-sept')).toBe(17);
    expect(parseSpokenNumber('douze et demi')).toBe(12.5);
    expect(parseSpokenNumber('zéro')).toBe(0);
  });

  it('refuses what is not a number', () => {
    expect(parseSpokenNumber('absent')).toBeNull();
    expect(parseSpokenNumber('')).toBeNull();
    expect(parseSpokenNumber('quinze seize')).toBeNull();
  });
});

describe('spoken marks', () => {
  it('reads "Alice 15, Paul 12, Marc 17"', () => {
    const rows = parseSpokenMarks('Alice 15, Paul 12, Marc 17.', roster);
    expect(rows.map((r) => [r.studentId, r.score])).toEqual([['alice', 15], ['paul', 12], ['marc', 17]]);
  });

  it('reads decimals and number words', () => {
    const rows = parseSpokenMarks('Alice Kouassi 12,5 Paul quinze Marc dix-sept et demi', roster);
    expect(rows.map((r) => r.score)).toEqual([12.5, 15, 17.5]);
  });

  it('flags a mark above the scale and never keeps it', () => {
    const [row] = parseSpokenMarks('Alice 25', roster);
    expect(row).toMatchObject({ studentId: 'alice', score: null, confidence: 'A_VERIFIER' });
    expect(row.issue).toContain('dépasse le barème');
  });

  it('flags a name without a mark, an unknown name and an ambiguous name', () => {
    const rows = parseSpokenMarks('Fatou 14, Awa 11, Paul', roster);
    expect(rows[0]).toMatchObject({ studentId: null, score: 14, confidence: 'INCONNU' });
    expect(rows[1].studentId).toBeNull();
    expect(rows[2]).toMatchObject({ studentId: 'paul', score: null, confidence: 'A_VERIFIER' });
  });
});

describe('marks read on a sheet', () => {
  it('matches each line and carries the doubt of the reader', () => {
    const rows = matchSheetLines([{ name: 'KOUASSI Alice', score: '15/20' }, { name: 'YAO Paul', score: '1?', doubt: 'Chiffre peu lisible' }, { name: 'Inconnu Jean', score: '9' }], roster);
    expect(rows[0]).toMatchObject({ studentId: 'alice', score: 15, confidence: 'SURE' });
    expect(rows[1]).toMatchObject({ studentId: 'paul', score: null, confidence: 'A_VERIFIER' });
    expect(rows[1].issue).toContain('Chiffre peu lisible');
    expect(rows[2]).toMatchObject({ studentId: null, confidence: 'INCONNU' });
  });
});

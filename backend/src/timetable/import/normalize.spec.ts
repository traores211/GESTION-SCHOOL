import { classKey, parseDay, parseHours, parseTime, parseTimeRange, personKey, roomKey, subjectKey } from './normalize';
import { matchEntity, resolveEntities } from './entity-matcher';

describe('parseDay', () => {
  it.each([
    ['Lundi', 1],
    ['LUN.', 1],
    ['mardi', 2],
    ['Mercredi matin', 3],
    ['thursday', 4],
    ['Ven', 5],
    ['samedi', 6],
    ['Dim', 7],
  ])('%s → %d', (input, day) => expect(parseDay(input)).toBe(day));

  it.each(['', 'Maths', 'L', 'Lundi 8h Maths'])('does not guess on %p', (input) => expect(parseDay(input)).toBeNull());
});

describe('times', () => {
  it.each([
    ['8h', '08:00'],
    ['08h30', '08:30'],
    ['8:05', '08:05'],
    ['8.30', '08:30'],
    ['14H', '14:00'],
  ])('parseTime(%s)', (input, out) => expect(parseTime(input)).toBe(out));

  it('reads Excel day fractions and rejects nonsense', () => {
    expect(parseTime(0.375)).toBe('09:00');
    expect(parseTime('25h')).toBeNull();
    expect(parseTime('abc')).toBeNull();
  });

  it.each([
    ['08h00-10h00', { start: '08:00', end: '10:00' }],
    ['8h - 10h', { start: '08:00', end: '10:00' }],
    ['8:00 à 9:55', { start: '08:00', end: '09:55' }],
    ['14h–15h30', { start: '14:00', end: '15:30' }],
    ['8-10', { start: '08:00', end: '10:00' }],
  ])('parseTimeRange(%s)', (input, out) => expect(parseTimeRange(input)).toEqual(out));

  it('is strict in free text and refuses reversed ranges', () => {
    expect(parseTimeRange('classe 6-7', true)).toBeNull();
    expect(parseTimeRange('10h-8h')).toBeNull();
  });

  it('parses weekly volumes', () => {
    expect(parseHours('4h')).toBe(4);
    expect(parseHours('3,5')).toBe(3.5);
    expect(parseHours('2 h 30')).toBe(2.5);
    expect(parseHours('beaucoup')).toBeNull();
  });
});

describe('name keys', () => {
  it('folds class spellings', () => {
    expect(classKey('6ème A')).toBe(classKey('6e A'));
    expect(classKey('6EME-A')).toBe(classKey('6e a'));
    expect(classKey('Terminale D')).toBe(classKey('Tle D'));
    expect(classKey('6e A')).not.toBe(classKey('6e B'));
  });

  it('folds teacher titles and order', () => {
    expect(personKey('M. Kouassi Aya')).toBe(personKey('AYA KOUASSI'));
  });

  it('folds room prefixes and subject abbreviations', () => {
    expect(roomKey('Salle 12')).toBe(roomKey('S12'));
    expect(subjectKey('Maths')).toBe(subjectKey('Mathématiques'));
    expect(subjectKey('HG')).toBe(subjectKey('Histoire et Géographie'));
  });
});

describe('entity matching', () => {
  const teachers = [
    { id: 't1', name: 'Kouassi Aya' },
    { id: 't2', name: 'Kouassi Jean' },
    { id: 't3', name: 'Diallo Yacouba' },
  ];

  it('accepts exact matches after normalization', () => {
    expect(matchEntity('teacher', 'Mme AYA KOUASSI', teachers)).toMatchObject({ status: 'exact', id: 't1' });
  });

  it('flags a surname shared by two teachers as ambiguous instead of picking one', () => {
    expect(matchEntity('teacher', 'M. Kouassi', teachers)).toMatchObject({ status: 'ambiguous', id: null });
  });

  it('proposes (but does not accept) a close match', () => {
    expect(matchEntity('teacher', 'Diallo', teachers)).toMatchObject({ status: 'probable', id: 't3' });
  });

  it('does not confuse neighbouring classes', () => {
    const classes = [
      { id: 'a', name: '6ème A' },
      { id: 'b', name: '6ème B' },
    ];
    expect(matchEntity('class', '6e C', classes).status).toBe('unknown');
    expect(matchEntity('class', '6e B', classes)).toMatchObject({ status: 'exact', id: 'b' });
  });

  it('suggests creating unknown classes but never unknown teachers', () => {
    const resolved = resolveEntities('teacher', ['Inconnu', 'Inconnu'], teachers);
    expect(resolved).toEqual([expect.objectContaining({ raw: 'Inconnu', occurrences: 2, suggestedAction: 'ignore' })]);
    expect(resolveEntities('class', ['2nde C'], [])[0].suggestedAction).toBe('create');
  });
});

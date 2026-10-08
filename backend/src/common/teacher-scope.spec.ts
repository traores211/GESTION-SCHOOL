import { canGradeSubject, teacherClassIds } from './teacher-scope';

describe('teacher scope', () => {
  const a = { mainClassIds: ['c1'], subjects: [{ classId: 'c2', subjectId: 'maths' }, { classId: 'c1', subjectId: 'maths' }] };

  it('lists each class once: main teacher or subject teacher', () => {
    expect(teacherClassIds(a).sort()).toEqual(['c1', 'c2']);
    expect(teacherClassIds({ mainClassIds: [], subjects: [] })).toEqual([]);
  });

  it('lets a teacher mark his own subjects', () => {
    expect(canGradeSubject(a, 'c2', 'maths', 'me', 'me')).toBe(true);
  });

  it('refuses a subject of a class he only teaches another subject in', () => {
    expect(canGradeSubject(a, 'c2', 'french', null, 'me')).toBe(false);
    expect(canGradeSubject(a, 'c2', 'french', 'other', 'me')).toBe(false);
  });

  it('lets the main teacher mark a subject nobody is assigned to, not a colleague’s', () => {
    expect(canGradeSubject(a, 'c1', 'art', null, 'me')).toBe(true);
    expect(canGradeSubject(a, 'c1', 'french', 'other', 'me')).toBe(false);
  });

  it('refuses a class he has nothing to do with', () => {
    expect(canGradeSubject(a, 'c9', 'maths', null, 'me')).toBe(false);
  });
});

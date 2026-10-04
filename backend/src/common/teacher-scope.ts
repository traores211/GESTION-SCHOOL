/**
 * What a teacher may reach: the classes he is the main teacher of, and the classes where a subject is
 * assigned to him. Other staff roles are not restricted by these rules.
 */
export interface TeacherAssignments {
  /** Classes whose main teacher ("professeur principal") is this teacher */
  mainClassIds: string[];
  /** Subjects assigned to this teacher, class by class */
  subjects: { classId: string; subjectId: string }[];
}

export function teacherClassIds(a: TeacherAssignments): string[] {
  return [...new Set([...a.mainClassIds, ...a.subjects.map((s) => s.classId)])];
}

/**
 * A teacher marks the subjects assigned to him. The main teacher of a class may also mark a subject
 * nobody is assigned to (primary school: one teacher for the whole class), never a colleague's subject.
 */
export function canGradeSubject(a: TeacherAssignments, classId: string, subjectId: string, assignedTeacherId: string | null, selfId: string): boolean {
  if (a.subjects.some((s) => s.classId === classId && s.subjectId === subjectId)) return true;
  if (!a.mainClassIds.includes(classId)) return false;
  return assignedTeacherId === null || assignedTeacherId === selfId;
}

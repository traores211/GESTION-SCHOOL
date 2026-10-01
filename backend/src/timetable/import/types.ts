/**
 * Import pipeline contracts:
 *   upload → detectFileKind → DocumentParser → extractors → normalization → entity matching
 *   → (user review) → validation + conflict detection → scheduler → sessions
 */

export type FileKind = 'csv' | 'xlsx' | 'docx' | 'pdf' | 'image' | 'text';

export interface DetectedFile {
  kind: FileKind;
  mime: string;
  label: string;
}

export interface ParsedTable {
  /** Sheet name, "Tableau 2", "Page 1"… — also a hint for the class name. */
  name?: string;
  rows: string[][];
}

export interface ParsedDocument {
  kind: FileKind;
  tables: ParsedTable[];
  text: string;
  warnings: string[];
  /** Kept for AI vision analysis of images and scanned PDFs. */
  binary?: { buffer: Buffer; mime: string };
}

export interface DocumentParser {
  readonly kinds: FileKind[];
  parse(buffer: Buffer, file: DetectedFile): Promise<ParsedDocument>;
}

export type ExtractionMethod = 'list' | 'grid' | 'text' | 'ai';

/** One lesson (or one weekly volume to schedule) as read from the file, before any database mapping. */
export interface DraftRow {
  id: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  className: string | null;
  subjectName: string | null;
  teacherName: string | null;
  roomName: string | null;
  /** Weekly volume when the file lists requirements ("Maths 4 h") instead of placed lessons. */
  hoursPerWeek: number | null;
  /** Where it comes from, in words the user understands ("Feuille « 6e A », ligne 5"). */
  source: string;
  raw: string;
  method: ExtractionMethod;
  /** Doubts to review: nothing is silently guessed. */
  issues: string[];
}

export type EntityKind = 'class' | 'subject' | 'teacher' | 'room';

export interface KnownEntity {
  id: string;
  name: string;
  aliases?: string[];
}

export type MatchStatus = 'exact' | 'probable' | 'ambiguous' | 'unknown';

export interface EntityCandidate {
  id: string;
  name: string;
  score: number;
}

export interface EntityResolution {
  kind: EntityKind;
  raw: string;
  occurrences: number;
  status: MatchStatus;
  /** Proposed decision; `probable`/`ambiguous` ones must be confirmed by the user. */
  suggestedAction: 'match' | 'create' | 'ignore';
  suggestedId: string | null;
  candidates: EntityCandidate[];
}

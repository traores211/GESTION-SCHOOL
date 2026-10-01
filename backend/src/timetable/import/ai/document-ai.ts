import { DraftRow, ParsedDocument } from '../types';
import { Vocabulary } from '../extractors';

/**
 * Optional AI analysis of a timetable document. Implementations must only report what the document
 * says: every row they return is flagged for review, and unreadable values stay null.
 */
export interface DocumentAiProvider {
  readonly name: string;
  isAvailable(): boolean;
  extract(doc: ParsedDocument, vocab: Vocabulary, fileName: string): Promise<DraftRow[]>;
}

export const DOCUMENT_AI = Symbol('DOCUMENT_AI');

/** Used when no AI is configured: the heuristic extractors do all the work. */
export class DisabledDocumentAi implements DocumentAiProvider {
  readonly name = 'aucune';
  isAvailable() {
    return false;
  }
  async extract(): Promise<DraftRow[]> {
    return [];
  }
}

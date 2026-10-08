import { DetectedFile, DocumentParser, FileKind, ParsedDocument } from '../types';
import { cleanCell } from '../normalize';

/** RFC 4180-style parsing (quotes, doubled quotes, newlines inside quotes) with a detected delimiter. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const content = text.replace(/^\uFEFF/, '');
  const sep = delimiter ?? detectDelimiter(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map(cleanCell)).filter((r) => r.some((c) => c !== ''));
}

/** The candidate that splits the first lines into the most consistent, largest number of columns. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ';';
  let bestScore = -1;
  for (const sep of [';', ',', '\t', '|']) {
    const counts = lines.map((l) => l.split(sep).length - 1);
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter((c) => c === counts[0]).length / counts.length;
    const s = consistent * counts[0];
    if (s > bestScore) {
      bestScore = s;
      best = sep;
    }
  }
  return best;
}

/** Decodes UTF-8, falling back to Windows-1252 (Excel "CSV" exports on French Windows). */
export function decodeText(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(buffer);
}

export class CsvParser implements DocumentParser {
  readonly kinds: FileKind[] = ['csv', 'text'];

  async parse(buffer: Buffer, file: DetectedFile): Promise<ParsedDocument> {
    const text = decodeText(buffer);
    return {
      kind: file.kind,
      tables: file.kind === 'csv' ? [{ rows: parseDelimited(text) }] : [],
      text,
      warnings: [],
    };
  }
}

import mammoth from 'mammoth';
import { DetectedFile, DocumentParser, FileKind, ParsedDocument, ParsedTable } from '../types';
import { cleanCell } from '../normalize';

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

/**
 * Tables of a Word document, from mammoth's HTML. colspan is expanded so that day columns stay
 * aligned; rowspan is expanded too (a 2-hour lesson covers the next row).
 */
export function tablesFromHtml(html: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;
  let index = 0;
  while ((tableMatch = tableRe.exec(html))) {
    index++;
    const rows: string[][] = [];
    const pending: Map<number, { text: string; left: number }> = new Map();
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(tableMatch[1]))) {
      const row: string[] = [];
      const cellRe = /<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/gi;
      let cellMatch: RegExpExecArray | null;
      const fill = () => {
        while (pending.has(row.length)) {
          const p = pending.get(row.length)!;
          row.push(p.text);
          if (--p.left <= 0) pending.delete(row.length - 1);
        }
      };
      while ((cellMatch = cellRe.exec(rowMatch[1]))) {
        fill();
        const attrs = cellMatch[2];
        const text = cleanCell(htmlToText(cellMatch[3]));
        const colspan = Number(/colspan="(\d+)"/.exec(attrs)?.[1] ?? 1);
        const rowspan = Number(/rowspan="(\d+)"/.exec(attrs)?.[1] ?? 1);
        for (let c = 0; c < colspan; c++) {
          if (rowspan > 1) pending.set(row.length, { text, left: rowspan - 1 });
          row.push(text);
        }
      }
      fill();
      if (row.some((c) => c !== '')) rows.push(row);
    }
    if (rows.length) tables.push({ name: `Tableau ${index}`, rows });
  }
  return tables;
}

export class DocxParser implements DocumentParser {
  readonly kinds: FileKind[] = ['docx'];

  async parse(buffer: Buffer, file: DetectedFile): Promise<ParsedDocument> {
    const [{ value: html, messages }, { value: text }] = await Promise.all([
      mammoth.convertToHtml({ buffer }),
      mammoth.extractRawText({ buffer }),
    ]);
    // Headings before each table often carry the class ("Emploi du temps — 6e A").
    const tables = tablesFromHtml(html);
    const before = html.split(/<table[^>]*>/i).slice(0, -1);
    tables.forEach((t, i) => {
      const segment = (before[i] ?? '').split(/<\/table>/i).pop() ?? '';
      const paragraphs = [...segment.matchAll(/<(h\d|p)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => cleanCell(htmlToText(m[2]))).filter(Boolean);
      if (paragraphs.length) t.name = paragraphs[paragraphs.length - 1];
    });
    return {
      kind: file.kind,
      tables,
      text,
      warnings: messages.filter((m) => m.type === 'error').map((m) => m.message),
    };
  }
}

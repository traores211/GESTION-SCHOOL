// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- pdfjs-dist 3 ships no types for its legacy build
/// <reference path="../../../types/pdfjs.d.ts" />
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import { DetectedFile, DocumentParser, FileKind, ParsedDocument, ParsedTable } from '../types';
import { PositionedText, tableFromPositions } from './layout';

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

const MAX_PAGES = 30;

/** Text extraction with positions (pdf.js), then rows/columns rebuilt from where the text sits. */
export class PdfParser implements DocumentParser {
  readonly kinds: FileKind[] = ['pdf'];

  async parse(buffer: Buffer, file: DetectedFile): Promise<ParsedDocument> {
    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false, // no code generation from font data (CVE-2024-4367)
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    }).promise;
    const tables: ParsedTable[] = [];
    const lines: string[] = [];
    const warnings: string[] = [];
    try {
      const pages = Math.min(document.numPages, MAX_PAGES);
      if (document.numPages > MAX_PAGES) warnings.push(`Seules les ${MAX_PAGES} premières pages ont été analysées`);
      for (let n = 1; n <= pages; n++) {
        const page = await document.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items: PositionedText[] = (content.items as PdfTextItem[])
          .filter((i) => i.str && i.str.trim() && i.transform)
          .map((i) => {
            const t = i.transform!;
            const size = Math.hypot(t[2], t[3]) || i.height || 10;
            return { text: i.str!, x0: t[4], x1: t[4] + (i.width ?? 0), y: viewport.height - t[5] - size / 2, height: size };
          });
        const rows = tableFromPositions(items);
        if (rows.length) tables.push({ name: `Page ${n}`, rows });
        lines.push(...rows.map((r) => r.filter(Boolean).join('\t')));
        page.cleanup();
      }
    } finally {
      await document.destroy();
    }

    // The title above the grid usually names the class: keep it as the table name.
    for (const t of tables) {
      const title = t.rows.find((r) => r.filter(Boolean).length === 1)?.find(Boolean);
      if (title) t.name = `${t.name} — ${title}`;
    }
    const text = lines.join('\n').trim();
    if (!text) {
      warnings.push(
        "Ce PDF ne contient pas de texte (document scanné). Utilisez l'analyse IA, ou importez une photo/capture de l'emploi du temps.",
      );
    }
    return { kind: file.kind, tables, text, warnings, binary: { buffer, mime: file.mime } };
  }
}

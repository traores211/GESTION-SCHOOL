import ExcelJS from 'exceljs';
import { DetectedFile, DocumentParser, FileKind, ParsedDocument, ParsedTable } from '../types';
import { cleanCell, parseTime } from '../normalize';

type CellValue = ExcelJS.CellValue;

/** Text of an Excel cell whatever its type (rich text, formula result, hyperlink, time). */
function cellText(value: CellValue, numFmt?: string): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Excel stores a time of day as a date on 1899-12-30: keep only the time.
    return value.getUTCFullYear() <= 1900 ? parseTime(value) ?? '' : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    if (numFmt && /h|:mm/i.test(numFmt) && value > 0 && value < 1) return parseTime(value) ?? String(value);
    return String(value);
  }
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('result' in value) return cellText(value.result as CellValue, numFmt);
    if ('text' in value) return String(value.text);
    if ('error' in value) return '';
  }
  return String(value);
}

export class XlsxParser implements DocumentParser {
  readonly kinds: FileKind[] = ['xlsx'];

  async parse(buffer: Buffer, file: DetectedFile): Promise<ParsedDocument> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const tables: ParsedTable[] = [];
    const warnings: string[] = [];
    workbook.eachSheet((sheet) => {
      if (sheet.state !== 'visible') return;
      const rows: string[][] = [];
      const width = Math.min(sheet.columnCount, 60);
      sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        if (rowNumber > 1000) return;
        const cells: string[] = [];
        for (let c = 1; c <= width; c++) {
          const cell = row.getCell(c);
          // Merged cells: every covered cell reads the master's value, so a 2-hour lesson spans two rows.
          const source = cell.isMerged && cell.master ? cell.master : cell;
          cells.push(cleanCell(cellText(source.value, source.numFmt)));
        }
        rows[rowNumber - 1] = cells;
      });
      const dense = Array.from(rows, (r) => r ?? []).filter((r) => r.some((c) => c !== ''));
      if (sheet.rowCount > 1000) warnings.push(`Feuille « ${sheet.name} » : seules les 1000 premières lignes ont été lues`);
      if (dense.length) tables.push({ name: sheet.name, rows: dense });
    });
    return {
      kind: file.kind,
      tables,
      text: tables.map((t) => t.rows.map((r) => r.filter(Boolean).join(' | ')).join('\n')).join('\n\n'),
      warnings,
    };
  }
}

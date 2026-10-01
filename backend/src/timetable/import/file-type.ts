import { DetectedFile } from './types';

export class UnsupportedFileError extends Error {}

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function extensionOf(name: string) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Mostly printable UTF-8 without NUL bytes: a CSV or plain text export. */
function looksLikeText(buffer: Buffer) {
  const sample = buffer.subarray(0, 4096);
  if (sample.includes(0)) return false;
  const text = sample.toString('utf8');
  const bad = (text.match(/�/g) ?? []).length;
  return bad <= Math.max(2, text.length * 0.01);
}

/**
 * Identifies a file from its content (magic bytes), the extension only breaking ties between
 * text formats. The declared MIME type from the browser is never trusted.
 */
export function detectFileKind(buffer: Buffer, fileName: string): DetectedFile {
  const ext = extensionOf(fileName);
  if (buffer.length === 0) throw new UnsupportedFileError('Le fichier est vide');

  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf', mime: 'application/pdf', label: 'PDF' };
  if (buffer.subarray(0, 8).equals(PNG)) return { kind: 'image', mime: 'image/png', label: 'Image PNG' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { kind: 'image', mime: 'image/jpeg', label: 'Image JPEG' };
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { kind: 'image', mime: 'image/webp', label: 'Image WebP' };
  }
  if (buffer.subarray(0, 4).equals(ZIP)) {
    // OOXML archives list their parts by name in the (uncompressed) zip directory.
    if (buffer.includes('word/document.xml')) {
      return { kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word (.docx)' };
    }
    if (buffer.includes('xl/workbook.xml')) {
      return { kind: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel (.xlsx)' };
    }
    if (buffer.includes('content.xml')) {
      throw new UnsupportedFileError('Format OpenDocument (.ods/.odt) non pris en charge : enregistrez le fichier en .xlsx ou .docx');
    }
    throw new UnsupportedFileError("Archive ZIP non reconnue : seuls les fichiers .xlsx et .docx sont acceptés");
  }
  if (buffer.subarray(0, 8).equals(OLE)) {
    throw new UnsupportedFileError(
      'Ancien format Office (.xls/.doc) non pris en charge : enregistrez le fichier au format .xlsx ou .docx',
    );
  }
  if (looksLikeText(buffer)) {
    if (ext === 'csv' || ext === 'tsv') return { kind: 'csv', mime: 'text/csv', label: ext.toUpperCase() };
    const firstLines = buffer.subarray(0, 2048).toString('utf8').split(/\r?\n/).slice(0, 5);
    const delimited = firstLines.filter((l) => (l.match(/[;,\t]/g) ?? []).length >= 2).length;
    if (delimited >= Math.min(2, firstLines.length)) return { kind: 'csv', mime: 'text/csv', label: 'CSV' };
    return { kind: 'text', mime: 'text/plain', label: 'Texte' };
  }
  throw new UnsupportedFileError(
    `Format non reconnu${ext ? ` (.${ext})` : ''}. Formats acceptés : Excel (.xlsx), CSV, PDF, Word (.docx), images (PNG, JPEG)`,
  );
}

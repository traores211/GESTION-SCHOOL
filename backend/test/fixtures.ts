/**
 * Builds realistic timetable files in every supported format, for the parser tests and for the
 * end-to-end import checks (`npx ts-node test/make-fixtures.ts <dir>` writes them to disk).
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';

export const GRID = {
  className: '6ème A',
  days: ['Lundi', 'Mardi', 'Mercredi'],
  slots: ['08h00-09h00', '09h00-10h00', '10h00-10h15', '10h15-11h15'],
  // [slot][day]
  cells: [
    ['Maths\nM. Kouassi\nSalle 12', 'Français\nDiallo Yacouba', 'Anglais\nKoné Aminata\nSalle 3'],
    ['Maths\nM. Kouassi\nSalle 12', 'SVT\nLabo', ''],
    ['Récréation', 'Récréation', 'Récréation'],
    ['EPS', 'Histoire-Géo\nDiallo Yacouba\nSalle 12', 'Maths\nKouassi Aya'],
  ],
};

export const LIST_ROWS = [
  ['Jour', 'Début', 'Fin', 'Classe', 'Matière', 'Enseignant', 'Salle'],
  ['Lundi', '08:00', '10:00', '5ème A', 'Mathématiques', 'Kouassi Aya', 'Salle 12'],
  ['Mardi', '10:00', '11:00', '5ème A', 'Anglais', 'Koné Aminata', 'Salle 3'],
  ['Jeudi', '14:00', '16:00', '4ème A', 'SVT', '', 'Labo SVT'],
];

export async function buildXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const grid = wb.addWorksheet('6e A');
  grid.addRow([`Emploi du temps — ${GRID.className}`]);
  grid.addRow(['Horaires', ...GRID.days]);
  GRID.slots.forEach((slot, i) => grid.addRow([slot, ...GRID.cells[i]]));
  grid.mergeCells('B3:B4'); // Maths 08:00–10:00 on Monday as one merged cell
  const list = wb.addWorksheet('Liste');
  LIST_ROWS.forEach((r) => list.addRow(r));
  // A time typed as an Excel time value (fraction of a day) instead of text.
  list.getCell('B3').value = 10 / 24;
  list.getCell('B3').numFmt = 'hh:mm';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildCsv(): Buffer {
  return Buffer.from('﻿' + LIST_ROWS.map((r) => r.map((c) => (c.includes(';') ? `"${c}"` : c)).join(';')).join('\r\n'), 'utf8');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc>${(text || ' ').split('\n').map(para).join('')}</w:tc>`;

export async function buildDocx(): Promise<Buffer> {
  const rows = [['Horaires', ...GRID.days], ...GRID.slots.map((s, i) => [s, ...GRID.cells[i]])];
  const table = `<w:tbl>${rows.map((r) => `<w:tr>${r.map(cell).join('')}</w:tr>`).join('')}</w:tbl>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${para(`Emploi du temps — ${GRID.className}`)}${table}${para('')}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file('word/document.xml', document);
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** A grid drawn as a real PDF table: text positioned in columns, as exported by Word/Excel. */
export function buildPdf(): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(14).text(`Emploi du temps — ${GRID.className}`, 30, 30);
    const x0 = 30;
    const colW = 170;
    const rowH = 60;
    const y0 = 70;
    doc.fontSize(10);
    ['Horaires', ...GRID.days].forEach((h, c) => doc.text(h, x0 + c * colW + 4, y0 + 4, { width: colW - 8, lineBreak: false }));
    GRID.slots.forEach((slot, r) => {
      const y = y0 + (r + 1) * rowH;
      doc.text(slot, x0 + 4, y + 4, { width: colW - 8, lineBreak: false });
      GRID.cells[r].forEach((text, c) => {
        text.split('\n').forEach((line, l) => doc.text(line, x0 + (c + 1) * colW + 4, y + 4 + l * 13, { width: colW - 8, lineBreak: false }));
      });
    });
    for (let r = 0; r <= GRID.slots.length + 1; r++) doc.moveTo(x0, y0 + r * rowH).lineTo(x0 + 4 * colW, y0 + r * rowH).stroke();
    doc.end();
  });
}

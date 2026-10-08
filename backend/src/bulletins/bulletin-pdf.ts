import type PDFKit from 'pdfkit';
import { BulletinsService } from './bulletins.service';

export type Card = Awaited<ReturnType<BulletinsService['bulletin']>>;

const INK = '#1a1a1a';
const MUTED = '#5c5c5c';
const RULE = '#b8b8b8';
const BAND = '#eef1ee';
const GREEN = '#0b6b3a';

const num = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? '—' : n.toFixed(digits).replace('.', ','));
const date = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/** Draws one report card on the current page of the document (A4 portrait, 36 pt margins). */
export function drawBulletin(doc: PDFKit.PDFDocument, card: Card) {
  const left = 36;
  const width = doc.page.width - 72;
  const s = card.student;

  // ---- header
  doc.font('Helvetica-Bold').fontSize(15).fillColor(GREEN).text(card.school.name.toUpperCase(), left, 36, { width: width - 150 });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text([card.school.city, card.school.phone].filter(Boolean).join(' · ') || ' ', left, doc.y + 1, { width: width - 150 });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`Année scolaire ${card.year}`, left + width - 150, 38, { width: 150, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(`Classe : ${card.class.name}`, left + width - 150, 50, { width: 150, align: 'right' });
  let y = 76;
  doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1.2).strokeColor(GREEN).stroke();
  y += 10;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(`BULLETIN DE NOTES — ${card.term.name.toUpperCase()}`, left, y, { width, align: 'center' });
  y += 24;

  // ---- identity
  doc.rect(left, y, width, 46).lineWidth(0.6).strokeColor(RULE).stroke();
  const field = (label: string, value: string, x: number, fy: number, w: number) => {
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label, x, fy, { width: w });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(value, x, fy + 9, { width: w, ellipsis: true, height: 11 });
  };
  field('Nom et prénoms', `${s.lastName.toUpperCase()} ${s.firstName}`, left + 8, y + 5, 250);
  field('Matricule', s.matricule, left + 268, y + 5, 90);
  field('Sexe', s.gender === 'F' ? 'Féminin' : 'Masculin', left + 368, y + 5, 60);
  field('Effectif', String(card.stats.size), left + 438, y + 5, 70);
  field('Né(e) le', `${date(s.dateOfBirth)}${s.placeOfBirth ? ` à ${s.placeOfBirth}` : ''}`, left + 8, y + 25, 250);
  field('Professeur principal', card.class.headTeacher ?? '—', left + 268, y + 25, 240);
  y += 56;

  // ---- subjects table
  const cols = [
    { label: 'Matière', w: 138, align: 'left' as const },
    { label: 'Coef.', w: 34, align: 'center' as const },
    { label: 'Moy. /20', w: 52, align: 'center' as const },
    { label: 'Moy. × coef', w: 66, align: 'center' as const },
    { label: 'Rang', w: 58, align: 'center' as const },
    { label: 'Moy. classe', w: 64, align: 'center' as const },
    { label: 'Appréciation', w: width - 412, align: 'left' as const },
  ];
  const rowHeight = Math.max(15, Math.min(22, Math.floor(330 / Math.max(card.subjects.length + 2, 1))));
  const drawRow = (cells: string[], ry: number, opts: { bold?: boolean; fill?: string; sub?: (string | null)[] } = {}) => {
    if (opts.fill) doc.rect(left, ry, width, rowHeight).fill(opts.fill);
    let x = left;
    cells.forEach((text, i) => {
      const col = cols[i];
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(INK);
      const sub = opts.sub?.[i];
      doc.text(text, x + 4, ry + (sub && rowHeight >= 19 ? 2.5 : (rowHeight - 8.5) / 2), { width: col.w - 8, align: col.align, ellipsis: true, height: 10, lineBreak: false });
      if (sub && rowHeight >= 19) doc.font('Helvetica').fontSize(6.5).fillColor(MUTED).text(sub, x + 4, ry + 12, { width: col.w - 8, ellipsis: true, height: 8, lineBreak: false });
      x += col.w;
    });
    doc.moveTo(left, ry + rowHeight).lineTo(left + width, ry + rowHeight).lineWidth(0.4).strokeColor(RULE).stroke();
  };
  const tableTop = y;
  drawRow(cols.map((c) => c.label), y, { bold: true, fill: BAND });
  y += rowHeight;
  for (const row of card.subjects) {
    drawRow([row.subject, String(row.coefficient), num(row.average), num(row.weighted), row.rankLabel ?? '—', num(row.classAverage), row.appreciation ?? ''], y, { sub: [row.teacher] });
    y += rowHeight;
  }
  drawRow(['TOTAL', String(card.totals.coefficients), '', num(card.totals.weighted), '', '', ''], y, { bold: true, fill: BAND });
  y += rowHeight;
  // column separators and frame
  let x = left;
  for (const col of cols.slice(0, -1)) {
    x += col.w;
    doc.moveTo(x, tableTop).lineTo(x, y).lineWidth(0.4).strokeColor(RULE).stroke();
  }
  doc.rect(left, tableTop, width, y - tableTop).lineWidth(0.6).strokeColor(RULE).stroke();
  y += 10;

  // ---- summary: results, class, attendance
  const third = (width - 16) / 3;
  const box = (title: string, lines: [string, string][], bx: number) => {
    doc.rect(bx, y, third, 62).lineWidth(0.6).strokeColor(RULE).stroke();
    doc.rect(bx, y, third, 14).fill(BAND);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(title, bx + 6, y + 3.5, { width: third - 12 });
    lines.forEach(([label, value], i) => {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, bx + 6, y + 19 + i * 13.5, { width: third - 70 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(value, bx + third - 70, y + 19 + i * 13.5, { width: 64, align: 'right' });
    });
  };
  box("Résultats de l'élève", [['Moyenne générale', `${num(s.average)} / 20`], ['Rang', s.rankLabel ? `${s.rankLabel} / ${card.stats.ranked}` : '—'], ['Mention', s.appreciation ?? '—']], left);
  box('Résultats de la classe', [['Moyenne de la classe', num(card.stats.classAverage)], ['Plus forte moyenne', num(card.stats.best)], ['Plus faible moyenne', num(card.stats.lowest)]], left + third + 8);
  box('Assiduité', [['Absences non justifiées', String(s.absences.unjustified)], ['Absences justifiées', String(s.absences.justified)], ['Retards', String(s.absences.late)]], left + (third + 8) * 2);
  y += 72;

  // ---- annual result (last term)
  if (card.isLastTerm) {
    doc.rect(left, y, width, 30).lineWidth(0.6).strokeColor(RULE).stroke();
    const parts = s.termAverages.map((t) => `${t.name} : ${num(t.average)}`).join('     ');
    doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(parts, left + 8, y + 5, { width: width - 16 });
    doc.font('Helvetica-Bold').fontSize(9.5).text(`Moyenne annuelle : ${num(s.annualAverage)} / 20`, left + 8, y + 17, { width: width / 2 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(GREEN).text(card.decisionLabel ? `Décision du conseil : ${card.decisionLabel}` : 'Décision du conseil : ………………………………', left + width / 2, y + 17, { width: width / 2 - 8, align: 'right' });
    y += 38;
  }

  // ---- council
  doc.rect(left, y, width, 52).lineWidth(0.6).strokeColor(RULE).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Appréciation du conseil de classe', left + 8, y + 5);
  if (s.distinction) doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GREEN).text(s.distinction.label, left + width / 2, y + 5, { width: width / 2 - 8, align: 'right' });
  doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(s.councilAppreciation ?? '', left + 8, y + 19, { width: width - 16, height: 30, ellipsis: true });
  y += 62;

  // ---- signatures
  const sign = width / 3;
  ['Le professeur principal', "Le chef d'établissement", 'Les parents'].forEach((label, i) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label, left + sign * i, y, { width: sign, align: 'center' });
  });

  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(`Bulletin édité le ${new Date().toLocaleDateString('fr-FR')} — ${card.school.name}`, left, doc.page.height - 50, { width, align: 'center', lineBreak: false });
}

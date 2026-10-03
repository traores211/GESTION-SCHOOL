import { Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/current-user.decorator';
import { DAY_NAMES, overlaps, toMinutes } from '../domain/time';
import { YearGrid, buildPeriods, formatHours, lessonHours } from '../domain/grid';
import { TimetableService, teacherDisplayName } from '../timetable.service';
import { PlanningDataService } from './planning-data.service';
import { ExportQueryDto } from './planning.dto';

interface ExportLesson {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subject: string;
  color: string | null;
  className: string;
  teacher: string;
  room: string;
  locked: boolean;
}

interface ExportPage {
  title: string;
  lessons: ExportLesson[];
}

/** Rows of the printed grid: the periods of the longest day, plus the breaks between them. */
function timeRows(grid: YearGrid, lessons: ExportLesson[]) {
  const periods = [...buildPeriods(grid).values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const rows: { start: string; end: string; pause: boolean }[] = [];
  let cursor = grid.start;
  for (const p of periods) {
    if (p.start > cursor) rows.push({ start: cursor, end: p.start, pause: true });
    rows.push({ start: p.start, end: p.end, pause: false });
    cursor = p.end;
  }
  if (cursor < grid.end) rows.push({ start: cursor, end: grid.end, pause: true });
  // Lessons outside the grid (old data) still need a row.
  for (const l of lessons) {
    if (!rows.some((r) => overlaps(r.start, r.end, l.startTime, l.endTime))) rows.push({ start: l.startTime, end: l.endTime, pause: false });
  }
  return rows.sort((a, b) => a.start.localeCompare(b.start));
}

function hexToArgb(hex: string | null, alpha = 'FF') {
  const h = (hex ?? '').replace('#', '');
  return /^[0-9a-f]{6}$/i.test(h) ? `${alpha}${h.toUpperCase()}` : 'FFE8EEF4';
}

/** Light tint of a subject colour for printing. */
function tint(hex: string | null, amount = 0.82) {
  const h = (hex ?? '#5b7083').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#e8eef4';
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return '#' + c.map((v) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0')).join('');
}

@Injectable()
export class TimetableExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timetable: TimetableService,
    private readonly planning: PlanningDataService,
  ) {}

  private async pages(user: AuthUser, q: ExportQueryDto) {
    const schoolId = this.timetable.requireSchool(user);
    const yearId = await this.timetable.resolveYearId(schoolId, q.academicYearId);
    const [school, year, grid, sessions] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } }),
      this.prisma.academicYear.findUniqueOrThrow({ where: { id: yearId }, select: { name: true } }),
      this.planning.loadGrid(schoolId, yearId),
      this.prisma.timetableSession.findMany({
        where: { schoolId, academicYearId: yearId },
        include: {
          class: { select: { id: true, name: true, level: true } },
          subject: { select: { name: true, color: true } },
          teacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
          room: { select: { id: true, name: true } },
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
    ]);

    let entities: { id: string; name: string }[];
    if (q.view === 'class') {
      entities = (await this.prisma.class.findMany({ where: { schoolId, academicYearId: yearId }, select: { id: true, name: true }, orderBy: [{ level: 'asc' }, { name: 'asc' }] }));
    } else if (q.view === 'teacher') {
      const ids = [...new Set(sessions.map((s) => s.teacherId).filter((x): x is string => !!x))];
      const teachers = await this.prisma.staffMember.findMany({ where: { id: { in: q.id ? [q.id] : ids }, user: { schoolId } }, select: { id: true, user: { select: { firstName: true, lastName: true } } } });
      entities = teachers.map((t) => ({ id: t.id, name: teacherDisplayName(t.user) })).sort((a, b) => a.name.localeCompare(b.name));
    } else {
      entities = await this.prisma.room.findMany({ where: { schoolId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    }
    if (q.id) {
      entities = entities.filter((e) => e.id === q.id);
      if (!entities.length) throw new NotFoundException(q.view === 'class' ? 'Classe introuvable' : q.view === 'teacher' ? 'Enseignant introuvable' : 'Salle introuvable');
    }

    const pages: ExportPage[] = entities.map((e) => ({
      title: e.name,
      lessons: sessions
        .filter((s) => (q.view === 'class' ? s.classId : q.view === 'teacher' ? s.teacherId : s.roomId) === e.id)
        .map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          subject: s.subject?.name ?? s.label ?? 'Séance',
          color: s.subject?.color ?? null,
          className: s.class?.name ?? '',
          teacher: s.teacher ? teacherDisplayName(s.teacher.user) : '',
          room: s.room?.name ?? '',
          locked: s.locked,
        })),
    }));
    const label = q.view === 'class' ? 'Classe' : q.view === 'teacher' ? 'Enseignant' : 'Salle';
    return { school: school.name, year: year.name, grid, pages, label };
  }

  async export(user: AuthUser, q: ExportQueryDto): Promise<{ buffer: Buffer; fileName: string; mime: string }> {
    const ctx = await this.pages(user, q);
    const slug = (q.id && ctx.pages[0] ? ctx.pages[0].title : `${q.view === 'class' ? 'classes' : q.view === 'teacher' ? 'enseignants' : 'salles'}`)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase();
    const fileName = `emploi-du-temps-${slug}-${ctx.year}.${q.format}`;
    if (q.format === 'xlsx') return { buffer: await this.excel(ctx), fileName, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    return { buffer: await this.pdf(ctx), fileName, mime: 'application/pdf' };
  }

  private secondary(l: ExportLesson, view: string) {
    return [view !== 'class' ? l.className : '', view !== 'teacher' ? l.teacher : '', view !== 'room' ? l.room : ''].filter(Boolean);
  }

  // ---------------------------------------------------------------- Excel

  private async excel(ctx: Awaited<ReturnType<TimetableExportService['pages']>>): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'School ERP';
    const view = ctx.label === 'Classe' ? 'class' : ctx.label === 'Enseignant' ? 'teacher' : 'room';
    const days = ctx.grid.days;
    const used = new Set<string>();
    for (const page of ctx.pages) {
      let name = page.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Feuille';
      while (used.has(name)) name = `${name.slice(0, 26)}-${used.size}`;
      used.add(name);
      const ws = wb.addWorksheet(name, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 } });
      ws.columns = [{ width: 13 }, ...days.map(() => ({ width: 24 }))];
      ws.mergeCells(1, 1, 1, days.length + 1);
      ws.getCell(1, 1).value = `${ctx.school} — Emploi du temps ${ctx.year} — ${ctx.label} : ${page.title}`;
      ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FF0D3B2B' } };
      const hours = page.lessons.reduce((s, l) => s + lessonHours(l.startTime, l.endTime, ctx.grid), 0);
      ws.mergeCells(2, 1, 2, days.length + 1);
      ws.getCell(2, 1).value = `${page.lessons.length} cours · ${formatHours(hours)} par semaine`;
      ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF555555' } };
      const head = ws.getRow(4);
      head.values = ['Horaire', ...days.map((d) => DAY_NAMES[d])];
      head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      head.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D3B2B' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      const rows = timeRows(ctx.grid, page.lessons);
      rows.forEach((r, i) => {
        const row = ws.getRow(5 + i);
        row.height = r.pause ? 16 : 44;
        const cell = row.getCell(1);
        cell.value = `${r.start}–${r.end}`;
        cell.font = { bold: !r.pause, color: { argb: r.pause ? 'FF888888' : 'FF333333' }, size: r.pause ? 8 : 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (r.pause) {
          days.forEach((_, j) => {
            const c = row.getCell(j + 2);
            c.value = 'Pause';
            c.font = { size: 8, color: { argb: 'FF999999' } };
            c.alignment = { horizontal: 'center', vertical: 'middle' };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
          });
        }
      });
      for (const l of page.lessons) {
        const col = days.indexOf(l.dayOfWeek);
        if (col < 0) continue;
        const covered = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.pause && overlaps(r.start, r.end, l.startTime, l.endTime));
        if (!covered.length) continue;
        const top = 5 + covered[0].i;
        const bottom = 5 + covered[covered.length - 1].i;
        const cell = ws.getCell(top, col + 2);
        if (cell.isMerged || cell.value) continue;
        if (bottom > top) {
          try {
            ws.mergeCells(top, col + 2, bottom, col + 2);
          } catch {
            /* overlapping lesson already merged here */
          }
        }
        const target = ws.getCell(top, col + 2);
        target.value = [`${l.subject}${l.locked ? ' 🔒' : ''}`, ...this.secondary(l, view), `${l.startTime}–${l.endTime}`].join('\n');
        target.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
        target.font = { size: 9, bold: false };
        target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(tint(l.color), 'FF') } };
        target.border = { left: { style: 'medium', color: { argb: hexToArgb(l.color) } } };
      }
      for (let r = 4; r < 5 + rows.length; r++) {
        for (let c = 1; c <= days.length + 1; c++) {
          const cell = ws.getCell(r, c);
          cell.border = { ...cell.border, top: { style: 'thin', color: { argb: 'FFD0D7DE' } }, bottom: { style: 'thin', color: { argb: 'FFD0D7DE' } }, right: { style: 'thin', color: { argb: 'FFD0D7DE' } } };
        }
      }
    }
    if (!ctx.pages.length) wb.addWorksheet('Vide').addRow(['Aucun emploi du temps à exporter']);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ---------------------------------------------------------------- PDF

  private pdf(ctx: Awaited<ReturnType<TimetableExportService['pages']>>): Promise<Buffer> {
    const view = ctx.label === 'Classe' ? 'class' : ctx.label === 'Enseignant' ? 'teacher' : 'room';
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, autoFirstPage: false, info: { Title: `Emploi du temps ${ctx.year}`, Author: ctx.school } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    const days = ctx.grid.days;
    const pages = ctx.pages.length ? ctx.pages : [{ title: '—', lessons: [] }];

    for (const page of pages) {
      doc.addPage();
      // Everything is positioned by hand: without a bottom margin pdfkit never starts a page on its own.
      doc.page.margins.bottom = 0;
      const { width, height } = doc.page;
      const m = 28;
      doc.rect(0, 0, width, 5).fill('#F77F00');
      doc.rect(width / 3, 0, width / 3, 5).fill('#FFFFFF');
      doc.rect((2 * width) / 3, 0, width / 3, 5).fill('#009E60');
      doc.fillColor('#0D3B2B').font('Helvetica-Bold').fontSize(16).text(`${ctx.label} : ${page.title}`, m, m);
      const hours = page.lessons.reduce((s, l) => s + lessonHours(l.startTime, l.endTime, ctx.grid), 0);
      doc.fillColor('#555').font('Helvetica').fontSize(9).text(`${ctx.school} · Emploi du temps ${ctx.year} · ${page.lessons.length} cours, ${formatHours(hours)} par semaine`, m, m + 20);

      const top = m + 44;
      const left = m + 46;
      const bottom = height - m - 14;
      const colW = (width - left - m) / Math.max(1, days.length);
      const rows = timeRows(ctx.grid, page.lessons);
      const startMin = toMinutes(rows[0]?.start ?? ctx.grid.start);
      const endMin = toMinutes(rows[rows.length - 1]?.end ?? ctx.grid.end);
      const headH = 18;
      const scale = (bottom - top - headH) / Math.max(60, endMin - startMin);
      const y = (t: string) => top + headH + (toMinutes(t) - startMin) * scale;

      days.forEach((d, i) => {
        doc.rect(left + i * colW, top, colW, headH).fill('#0D3B2B');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text(DAY_NAMES[d], left + i * colW, top + 5, { width: colW, align: 'center' });
      });
      for (const r of rows) {
        const y0 = y(r.start);
        const h = y(r.end) - y0;
        if (r.pause) doc.rect(left, y0, colW * days.length, h).fill('#F3F3F3');
        doc.fillColor(r.pause ? '#999' : '#333').font(r.pause ? 'Helvetica' : 'Helvetica-Bold').fontSize(r.pause ? 6.5 : 8);
        if (h >= 7) doc.text(r.pause ? `${r.start} pause` : r.start, m, y0 + 1, { width: 44 });
        doc.moveTo(left, y0).lineTo(left + colW * days.length, y0).lineWidth(0.4).strokeColor('#D0D7DE').stroke();
      }
      doc.moveTo(left, y(rows[rows.length - 1]?.end ?? ctx.grid.end)).lineTo(left + colW * days.length, y(rows[rows.length - 1]?.end ?? ctx.grid.end)).strokeColor('#D0D7DE').stroke();
      for (let i = 0; i <= days.length; i++) doc.moveTo(left + i * colW, top).lineTo(left + i * colW, y(rows[rows.length - 1]?.end ?? ctx.grid.end)).strokeColor('#D0D7DE').stroke();

      for (const l of page.lessons) {
        const col = days.indexOf(l.dayOfWeek);
        if (col < 0) continue;
        const x0 = left + col * colW + 2;
        const y0 = y(l.startTime) + 1;
        const h = Math.max(10, y(l.endTime) - y(l.startTime) - 2);
        const w = colW - 4;
        doc.roundedRect(x0, y0, w, h, 3).fill(tint(l.color));
        doc.rect(x0, y0, 3, h).fill(l.color && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#5B7083');
        doc.fillColor('#1A1A1A').font('Helvetica-Bold').fontSize(8.5).text(`${l.subject}${l.locked ? ' (verrouillé)' : ''}`, x0 + 6, y0 + 3, { width: w - 9, height: 11, ellipsis: true });
        const lines = [...this.secondary(l, view), `${l.startTime}–${l.endTime}`];
        doc.font('Helvetica').fontSize(7).fillColor('#444');
        let ty = y0 + 14;
        for (const line of lines) {
          if (ty + 8 > y0 + h) break;
          doc.text(line, x0 + 6, ty, { width: w - 9, height: 9, ellipsis: true, lineBreak: false });
          ty += 8.5;
        }
      }
      doc.fillColor('#888').font('Helvetica').fontSize(7).text(`Édité le ${new Date().toLocaleDateString('fr-FR')} · School ERP`, m, height - m - 6, { width: width - 2 * m, align: 'right', lineBreak: false });
    }
    doc.end();
    return done;
  }
}

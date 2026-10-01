/**
 * Rebuilds rows and columns from positioned text (PDF text items, OCR words): the only structure
 * those formats keep is where each piece of text sits on the page.
 */
export interface PositionedText {
  text: string;
  x0: number;
  x1: number;
  /** Vertical centre, growing downwards. */
  y: number;
  height: number;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function tableFromPositions(items: PositionedText[], maxColumns = 30): string[][] {
  const tokens = items.filter((t) => t.text.trim());
  if (!tokens.length) return [];
  const h = median(tokens.map((t) => t.height)) || 10;

  // 1. Lines: tokens whose vertical centres are close.
  const sorted = [...tokens].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines: PositionedText[][] = [];
  for (const t of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - t.y) <= h * 0.5) line.push(t);
    else lines.push([t]);
  }

  // 2. Segments: tokens of a line separated by less than a word gap belong to the same cell.
  const segmentLines = lines.map((line) => {
    const byX = line.sort((a, b) => a.x0 - b.x0);
    const segments: PositionedText[] = [];
    for (const t of byX) {
      const last = segments[segments.length - 1];
      if (last && t.x0 - last.x1 < h * 0.9) {
        last.text += (t.x0 - last.x1 > h * 0.15 ? ' ' : '') + t.text;
        last.x1 = Math.max(last.x1, t.x1);
      } else segments.push({ ...t });
    }
    return segments;
  });

  // 3. Columns: cluster segment starts across the page.
  const starts = segmentLines.flat().map((s) => s.x0).sort((a, b) => a - b);
  const columns: number[] = [];
  for (const x of starts) {
    if (!columns.length || x - columns[columns.length - 1] > h * 1.5) columns.push(x);
  }
  if (columns.length > maxColumns) return segmentLines.map((segs) => [segs.map((s) => s.text).join(' ')]);

  const columnOf = (x: number) => {
    let index = 0;
    for (let i = 0; i < columns.length; i++) if (columns[i] <= x + h * 0.75) index = i;
    return index;
  };
  return segmentLines.map((segs) => {
    const row = new Array<string>(columns.length).fill('');
    for (const s of segs) {
      const c = columnOf(s.x0);
      row[c] = row[c] ? `${row[c]} ${s.text.trim()}` : s.text.trim();
    }
    return row;
  });
}

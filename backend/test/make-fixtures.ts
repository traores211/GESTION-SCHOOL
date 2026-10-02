/** Writes the sample timetable files used for manual and end-to-end import checks. */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildCsv, buildDocx, buildPdf, buildXlsx } from './fixtures';

async function main() {
  const dir = process.argv[2] || join(__dirname, 'out');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'emploi-du-temps.xlsx'), await buildXlsx());
  writeFileSync(join(dir, 'emploi-du-temps.csv'), buildCsv());
  writeFileSync(join(dir, 'emploi-du-temps.docx'), await buildDocx());
  writeFileSync(join(dir, 'emploi-du-temps.pdf'), await buildPdf());
  console.log(`Fixtures written to ${dir}`);
}

main();

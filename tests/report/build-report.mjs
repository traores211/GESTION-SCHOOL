// Builds the executed acceptance book (Markdown table) from Playwright's JSON report(s).
//   node tests/report/build-report.mjs test-results/runs/*.json > docs/testing/resultats.md
import { readFileSync } from 'fs';
import { CATALOG } from './catalog.mjs';

const ANSI = /\u001b\[[0-9;]*m/g;
const firstLine = (msg, n) => (msg ?? '').split('\n')[0].replace(ANSI, '').slice(0, n);

const results = new Map(); // key: `${id}|${project}` — later files override earlier ones
for (const file of process.argv.slice(2)) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const id = /^\[([A-Z]+-\d+)\]/.exec(spec.title)?.[1];
      if (!id) continue;
      for (const t of spec.tests) {
        const r = t.results.at(-1) ?? {};
        const reason = (t.annotations ?? []).find((a) => a.type === 'skip')?.description ?? '';
        // Skipped because a prerequisite is missing (e.g. invalid AI key) = BLOCKED;
        // skipped because the scenario does not apply to this device = NOT APPLICABLE.
        const status =
          t.status === 'skipped' || r.status === 'skipped'
            ? /non configuré|indisponible|bloqu/i.test(reason)
              ? 'BLOCKED'
              : 'NA'
            : t.status === 'flaky'
              ? 'PASS au rejeu'
              : r.status === 'passed'
                ? 'PASS'
                : 'FAIL';
        results.set(`${id}|${t.projectName}`, {
          id,
          project: t.projectName,
          status,
          ms: r.duration ?? 0,
          reason,
          error: firstLine(r.error?.message, 160),
          firstError: firstLine(t.results[0]?.error?.message, 120),
          title: spec.title,
        });
      }
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of json.suites) walk(s);
}

const rows = [...results.values()].sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true }) || a.project.localeCompare(b.project));
const count = (st) => rows.filter((r) => r.status === st).length;
const esc = (s) => String(s).replace(/\|/g, '\\|');

console.log('| ID | Module | Scénario | Précondition | Action | Résultat attendu | Priorité | Automatisé | Plateforme | Résultat | Durée | Observation |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const [module, pre, action, expected, prio] = CATALOG[r.id] ?? ['?', '', '', '', ''];
  const scenario = r.title.replace(/^\[[A-Z]+-\d+\]\s*/, '');
  const obs = r.status === 'FAIL' ? r.error : r.status === 'PASS au rejeu' ? `1er passage : ${r.firstError}` : r.reason;
  console.log(`| ${r.id} | ${esc(module)} | ${esc(scenario)} | ${esc(pre)} | ${esc(action)} | ${esc(expected)} | ${prio} | Oui (Playwright) | ${r.project} | **${r.status}** | ${(r.ms / 1000).toFixed(1)} s | ${esc(obs)} |`);
}
console.log(`\n**Total : ${rows.length} exécutions — PASS ${count('PASS')} · PASS au rejeu ${count('PASS au rejeu')} · FAIL ${count('FAIL')} · BLOCKED ${count('BLOCKED')} · NA ${count('NA')}**`);
const missing = Object.keys(CATALOG).filter((id) => !rows.some((r) => r.id === id));
if (missing.length) console.log(`\nScénarios du catalogue non exécutés : ${missing.join(', ')}`);

#!/usr/bin/env node
/**
 * End-to-end check against a running stack (default http://localhost:4000/api):
 * auth + permissions, timetable CRUD and conflicts, then for every fixture file
 * upload → analysis → preview → commit → display → edit → undo. Leaves the data as it found it.
 *
 *   node test/e2e-import.js [fixturesDir] [apiUrl]
 * Fixtures: `npm run fixtures -- <dir>` (xlsx, csv, docx, pdf); add a .png/.jpg to test OCR.
 */
const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || path.join(__dirname, 'out');
const API = process.argv[3] || process.env.API_URL || 'http://localhost:4000/api';
const results = [];

async function call(method, url, token, body, isForm) {
  const res = await fetch(API + url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '', ms: Date.now() - started });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message, ms: Date.now() - started });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function login(email, password) {
  const r = await call('POST', '/auth/login', null, { email, password });
  assert(r.status === 200 && r.body.accessToken, `login ${email} → ${r.status}`);
  return r.body.accessToken;
}

/** Accept every suggestion like a user clicking "Confirmer les suggestions"; unknown names are created. */
function decisionsFor(entities) {
  return entities.map((e) => ({
    kind: e.kind,
    raw: e.raw,
    action: e.suggestedId ? 'match' : e.status === 'ambiguous' && e.candidates[0] ? 'match' : e.kind === 'teacher' ? 'ignore' : 'create',
    id: e.suggestedId || (e.status === 'ambiguous' && e.candidates[0] ? e.candidates[0].id : null),
  }));
}

async function main() {
  let admin;
  await check('Health (API + base de données)', async () => {
    const r = await call('GET', '/health');
    assert(r.status === 200 && r.body.database === 'up', `health ${JSON.stringify(r.body)}`);
    return 'database up';
  });
  await check('Login admin', async () => {
    admin = await login('admin@school.local', 'admin123');
  });
  await check('Login refusé (mauvais mot de passe) → 401 message clair', async () => {
    const r = await call('POST', '/auth/login', null, { email: 'admin@school.local', password: 'wrong' });
    assert(r.status === 401 && /incorrect/.test(r.body.message), `${r.status} ${r.body.message}`);
  });

  await check('Permissions : parent refusé sur les données école', async () => {
    const parent = await login('parent@school.local', 'parent123');
    for (const url of ['/students', '/staff', '/payroll', '/timetable/sessions']) {
      const r = await call('GET', url, parent);
      assert(r.status === 403, `${url} → ${r.status}`);
    }
    const own = await call('GET', '/parent-portal/children', parent);
    assert(own.status === 200, `parent portal → ${own.status}`);
    return '4 routes refusées, portail parent OK';
  });

  await check('Permissions : enseignant lit mais ne modifie pas l’emploi du temps', async () => {
    const teacher = await login('k.kouassi@school.local', 'teach123');
    const res = await call('GET', '/timetable/resources', teacher);
    assert(res.status === 200 && res.body.me.teacherId, 'resources for teacher');
    const read = await call('GET', `/timetable/sessions?teacherId=${res.body.me.teacherId}`, teacher);
    assert(read.status === 200, `read ${read.status}`);
    const write = await call('POST', '/timetable/sessions', teacher, {});
    assert(write.status === 403, `write → ${write.status}`);
    const cls = await call('POST', '/classes', teacher, {});
    assert(cls.status === 403, `create class → ${cls.status}`);
    return `${read.body.sessions.length} séances visibles, écriture refusée`;
  });

  let resources;
  await check('Ressources de l’éditeur', async () => {
    const r = await call('GET', '/timetable/resources', admin);
    assert(r.status === 200, `resources ${r.status}`);
    resources = r.body;
    return `${resources.classes.length} classes, ${resources.teachers.length} enseignants, ${resources.rooms.length} salles`;
  });

  await check('Salles : création / doublon 409 / modification / suppression', async () => {
    const created = await call('POST', '/timetable/rooms', admin, { name: 'E2E Salle', capacity: 30 });
    assert(created.status === 201, `create ${created.status}`);
    const dup = await call('POST', '/timetable/rooms', admin, { name: 'E2E Salle' });
    assert(dup.status === 409, `duplicate → ${dup.status}`);
    const upd = await call('PATCH', `/timetable/rooms/${created.body.id}`, admin, { capacity: 32 });
    assert(upd.status === 200 && upd.body.capacity === 32, 'update');
    const del = await call('DELETE', `/timetable/rooms/${created.body.id}`, admin);
    assert(del.status === 200, `delete ${del.status}`);
  });

  await check('Séances : création, conflit 409, forçage, duplication, déplacement, suppression', async () => {
    const [c1, c2] = resources.classes;
    const teacher = resources.teachers[0];
    const base = { dayOfWeek: 7, startTime: '09:00', endTime: '10:00', teacherId: teacher.id, label: 'E2E' };
    const a = await call('POST', '/timetable/sessions', admin, { ...base, classId: c1.id });
    assert(a.status === 201 && a.body.conflicts.some((c) => c.kind === 'CLOSED_DAY'), `create ${a.status}`);
    const clash = await call('POST', '/timetable/sessions', admin, { ...base, classId: c2.id });
    assert(clash.status === 409 && clash.body.conflicts.some((c) => c.kind === 'TEACHER'), `clash → ${clash.status}`);
    const forced = await call('POST', '/timetable/sessions', admin, { ...base, classId: c2.id, force: true });
    assert(forced.status === 201, `forced ${forced.status}`);
    const listed = await call('GET', '/timetable/conflicts', admin);
    assert(listed.body.sessions.some((s) => s.id === forced.body.id), 'conflict listed');
    const invalid = await call('PATCH', `/timetable/sessions/${a.body.id}`, admin, { startTime: '11:00', endTime: '10:00' });
    assert(invalid.status === 400, `invalid slot → ${invalid.status}`);
    const moved = await call('PATCH', `/timetable/sessions/${forced.body.id}`, admin, { startTime: '10:00', endTime: '11:00' });
    assert(moved.status === 200 && !moved.body.conflicts.some((c) => c.severity === 'error'), `move ${moved.status}`);
    const dup = await call('POST', `/timetable/sessions/${a.body.id}/duplicate`, admin, { dayOfWeek: 7, startTime: '14:00' });
    assert(dup.status === 201 && dup.body.startTime === '14:00' && dup.body.endTime === '15:00', `duplicate ${dup.status}`);
    for (const id of [a.body.id, forced.body.id, dup.body.id]) {
      const d = await call('DELETE', `/timetable/sessions/${id}`, admin);
      assert(d.status === 200, `delete ${d.status}`);
    }
    const gone = await call('PATCH', `/timetable/sessions/${a.body.id}`, admin, { label: 'x' });
    assert(gone.status === 404, `deleted → ${gone.status}`);
  });

  await check('Validation des entrées (DTO) → 400', async () => {
    const r = await call('POST', '/timetable/sessions', admin, { classId: resources.classes[0].id, dayOfWeek: 9, startTime: '8h', endTime: '10:00', hack: 1 });
    assert(r.status === 400, `→ ${r.status}`);
    const u = await call('POST', '/timetable/import/analyze', admin, new FormData(), true);
    assert(u.status === 400, `empty upload → ${u.status}`);
  });

  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /\.(xlsx|csv|docx|pdf|png|jpe?g)$/i.test(f)).sort() : [];
  if (!files.length) results.push({ name: `Import (aucun fichier dans ${DIR})`, ok: false, detail: 'run: npm run fixtures -- <dir>', ms: 0 });

  for (const file of files) {
    await check(`Import ${path.extname(file).slice(1).toUpperCase()} : fichier → extraction → validation → génération → édition → annulation`, async () => {
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(path.join(DIR, file))]), file);
      const analysis = await call('POST', '/timetable/import/analyze', admin, form, true);
      assert(analysis.status === 201, `analyze ${analysis.status} ${JSON.stringify(analysis.body).slice(0, 200)}`);
      const a = analysis.body;
      assert(a.rows.length > 0, `no rows (${a.warnings.join(' ')})`);
      const complete = a.rows.filter((r) => r.dayOfWeek && r.startTime && r.endTime && r.className && r.subjectName);
      const body = {
        fileName: a.file.name,
        fileType: a.file.kind,
        method: a.method,
        mode: 'append',
        allowConflicts: true,
        rows: a.rows.map(({ id, dayOfWeek, startTime, endTime, className, subjectName, teacherName, roomName, hoursPerWeek }) => ({
          id, dayOfWeek, startTime, endTime, className, subjectName, teacherName, roomName, hoursPerWeek,
        })),
        entities: decisionsFor(a.entities),
      };
      const preview = await call('POST', '/timetable/import/preview', admin, body);
      assert(preview.status === 201, `preview ${preview.status} ${JSON.stringify(preview.body).slice(0, 200)}`);
      assert(preview.body.sessions.length > 0, 'preview has no session');
      const commit = await call('POST', '/timetable/import/commit', admin, body);
      assert(commit.status === 201 && commit.body.created === preview.body.sessions.length, `commit ${commit.status}`);

      const shown = await call('GET', `/timetable/sessions?classId=${commit.body.classIds[0]}`, admin);
      const mine = shown.body.sessions.filter((s) => s.importId === commit.body.importId);
      assert(mine.length > 0, 'imported sessions not displayed');
      const target = mine[0];
      const edit = await call('PATCH', `/timetable/sessions/${target.id}`, admin, { notes: 'modifié par e2e', force: true });
      assert(edit.status === 200 && edit.body.notes === 'modifié par e2e', `edit ${edit.status}`);

      const undo = await call('DELETE', `/timetable/imports/${commit.body.importId}`, admin);
      assert(undo.status === 200 && undo.body.deletedSessions === commit.body.created, `undo ${undo.status}`);
      // Entities created by the import (e.g. a new room) are cleaned up to leave the data unchanged.
      const cleanup = [
        ['room', '/timetable/rooms', '/timetable/rooms'],
        ['subject', '/subjects', '/subjects'],
        ['class', '/classes', '/classes'],
      ];
      for (const [kind, listUrl, deleteUrl] of cleanup) {
        if (!preview.body.toCreate[kind].length) continue;
        const list = await call('GET', listUrl, admin);
        for (const name of preview.body.toCreate[kind]) {
          const item = list.body.find((x) => x.name === name);
          if (item) await call('DELETE', `${deleteUrl}/${item.id}`, admin);
        }
      }
      return `${a.file.label} · méthode ${a.method} · ${a.rows.length} lignes (${complete.length} complètes) · ${commit.body.created} séances · ${commit.body.conflictCount} conflit(s)`;
    });
  }

  const width = Math.max(...results.map((r) => r.name.length));
  console.log('\nTEST'.padEnd(width + 2) + 'STATUT   DÉTAIL');
  for (const r of results) console.log(`${r.name.padEnd(width)}  ${r.ok ? 'PASS' : 'FAIL'}     ${r.detail} (${r.ms} ms)`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

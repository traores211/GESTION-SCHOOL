/* End-to-end check of the timetable planning API against a running backend with the demo seed.
 * Usage (inside the backend container): node test/e2e-planning.js [http://localhost:4000/api]
 */
const BASE = process.argv[2] || 'http://localhost:4000/api';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};

async function login(email, password) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = await r.json();
  return j.accessToken || j.access_token || j.token;
}

function client(token) {
  const call = async (method, path, body, raw = false) => {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    if (raw) return r;
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: r.status, body: json };
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), patch: (p, b) => call('PATCH', p, b), del: (p) => call('DELETE', p), raw: (p) => call('GET', p, undefined, true) };
}

(async () => {
  const admin = client(await login('admin@school.local', 'admin123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));

  console.log('Resources & compliance');
  const res = (await admin.get('/timetable/resources')).body;
  ok(res.classes?.length >= 6 && res.teachers?.length >= 10, `${res.classes?.length} classes, ${res.teachers?.length} teachers`);
  ok(res.settings?.slotMinutes === 55 && res.settings?.freeHalfDays === '3:PM', 'year grid: 55 min, Wednesday afternoon free', res.settings);
  ok(res.planning?.qualifications?.length > 0 && res.planning?.volumes?.length > 0, 'planning data sent to the editor');
  const comp = (await admin.get('/timetable/compliance')).body;
  ok(comp.totals?.classesOk === comp.classes?.length, `compliance: ${comp.totals?.classesOk}/${comp.classes?.length} classes conformes`, comp.totals);

  const sessions = (await admin.get('/timetable/sessions')).body.sessions;
  const klass = res.classes[0];
  const mine = sessions.filter((s) => s.classId === klass.id);
  const lesson = mine.find((s) => !s.locked && s.subject);
  const other = sessions.find((s) => s.classId !== klass.id && s.teacher && s.teacher.id !== lesson.teacher?.id);

  console.log('Unit check (checklist)');
  const check = (await admin.post('/timetable/check', {
    classId: klass.id, subjectId: lesson.subject.id, teacherId: other.teacher.id, roomId: null,
    dayOfWeek: other.dayOfWeek, startTime: other.startTime, endTime: other.endTime,
  })).body;
  const byId = Object.fromEntries((check.checks || []).map((c) => [c.id, c]));
  ok(check.ok === false && byId.TEACHER_FREE?.status === 'fail', 'teacher already teaching → ❌', byId.TEACHER_FREE);
  ok(['QUALIFIED', 'AVAILABLE', 'TEACHER_FREE', 'CLASS_FREE', 'ROOM', 'CLASS_VOLUME', 'TEACHER_MAX'].every((id) => byId[id]), 'every control is reported');
  ok(/planifiées \/ .* officielles/.test(byId.CLASS_VOLUME?.detail || ''), `volume shown: ${byId.CLASS_VOLUME?.detail}`);

  console.log('Create refused when the volume would be exceeded');
  const extra = await admin.post('/timetable/sessions', {
    classId: klass.id, subjectId: lesson.subject.id, teacherId: lesson.teacher?.id, dayOfWeek: 5, startTime: '16:20', endTime: '17:15',
  });
  ok(extra.status === 409 && Array.isArray(extra.body.checks), `409 with checks: ${extra.body.message}`);

  console.log('Options for the lesson form');
  const opts = (await admin.get(`/timetable/options?classId=${klass.id}&subjectId=${lesson.subject.id}&teacherId=${lesson.teacher.id}&excludeId=${lesson.id}&durationMinutes=55`)).body;
  ok(opts.teachers[0].qualified && opts.teachers.some((t) => !t.qualified), 'qualified teachers listed first');
  ok(Array.isArray(opts.freeSlots) && opts.freeSlots.length > 0, `${opts.freeSlots.length} free slots for the teacher`);
  ok(opts.rooms.some((r) => !r.suitable), 'specialised rooms flagged as unsuitable');

  console.log('Move refused → suggestions → move accepted → undo');
  const clash = mine.find((s) => s.id !== lesson.id);
  const refused = await admin.patch(`/timetable/sessions/${lesson.id}`, { dayOfWeek: clash.dayOfWeek, startTime: clash.startTime, endTime: lesson.endTime > lesson.startTime ? addMinutes(clash.startTime, minutes(lesson)) : clash.endTime });
  ok(refused.status === 409, `refused: ${refused.body.message}`);
  const sugg = (await admin.get(`/timetable/sessions/${lesson.id}/suggestions`)).body;
  ok(sugg.slots?.length > 0, `${sugg.slots?.length} suggested slots, ${sugg.teachers?.length} teachers, ${sugg.rooms?.length} rooms`);
  const target = sugg.slots[0];
  const moved = await admin.patch(`/timetable/sessions/${lesson.id}`, { dayOfWeek: target.dayOfWeek, startTime: target.startTime, endTime: target.endTime });
  ok(moved.status === 200, `moved to day ${target.dayOfWeek} ${target.startTime}`, moved.body);
  let hist = (await admin.get('/timetable/history?limit=5')).body;
  ok(hist[0]?.action === 'UPDATE' && hist[0]?.userName, `history: ${hist[0]?.summary} (${hist[0]?.userName})`);
  const undone = await admin.post(`/timetable/history/${hist[0].batchId}/undo`);
  ok(undone.status === 201, 'undo accepted', undone.body);
  const back = (await admin.get('/timetable/sessions')).body.sessions.find((s) => s.id === lesson.id);
  ok(back.dayOfWeek === lesson.dayOfWeek && back.startTime === lesson.startTime, 'lesson back in its original slot');
  const again = await admin.post(`/timetable/history/${hist[0].batchId}/undo`);
  ok(again.status === 409, 'second undo refused');

  console.log('Swap');
  // The generated timetable differs from one machine to the next: any pair of lessons of the class
  // will do, the first lesson alone may have no partner its teacher and room are free for.
  let swapped = null;
  const unlocked = mine.filter((s) => !s.locked);
  for (const a of [lesson, ...unlocked.filter((s) => s.id !== lesson.id)]) {
    for (const b of unlocked) {
      if (b.id === a.id) continue;
      const r = await admin.post(`/timetable/sessions/${a.id}/swap`, { otherId: b.id });
      if (r.status === 201) { swapped = b; break; }
    }
    if (swapped) break;
  }
  ok(!!swapped, swapped ? `swapped with ${swapped.subject?.name}` : 'no valid swap found');
  if (swapped) {
    hist = (await admin.get('/timetable/history?limit=1')).body;
    ok(hist[0].action === 'SWAP' && hist[0].count === 2, 'swap recorded as one batch of 2 changes');
    await admin.post(`/timetable/history/${hist[0].batchId}/undo`);
  }

  console.log('Lock + regeneration of one class');
  const lockR = await admin.patch(`/timetable/sessions/${lesson.id}/lock`, { locked: true });
  ok(lockR.status === 200, 'locked');
  const preview = (await admin.post('/timetable/generate/preview', { scope: 'class', classId: klass.id })).body;
  ok(preview.stats && preview.locked >= 1, `preview: ${preview.lessons?.length} lessons, ${preview.stats?.placedHours}h/${preview.stats?.requiredHours}h, locked kept: ${preview.locked}, unplaced: ${preview.unplaced?.length}`);
  ok(!preview.lessons.some((l) => l.dayOfWeek === lesson.dayOfWeek && l.startTime === lesson.startTime), 'locked slot left untouched');
  const apply = await admin.post('/timetable/generate/apply', { scope: 'class', classId: klass.id, lessons: preview.lessons.map(({ classId, subjectId, teacherId, roomId, dayOfWeek, startTime, endTime }) => ({ classId, subjectId, teacherId, roomId, dayOfWeek, startTime, endTime })) });
  ok(apply.status === 201, `applied: ${apply.body.created} created, ${apply.body.replaced} replaced`, apply.body);
  const after = (await admin.get('/timetable/sessions')).body.sessions;
  ok(after.some((s) => s.id === lesson.id && s.locked), 'locked lesson still there');
  const stale = await admin.post('/timetable/generate/apply', { scope: 'class', classId: klass.id, lessons: preview.lessons.slice(0, 3).map(({ classId, subjectId, teacherId, roomId, dayOfWeek, startTime, endTime }) => ({ classId, subjectId, teacherId, roomId, dayOfWeek, startTime, endTime })) });
  ok(stale.status === 201 || stale.status === 409, `re-applying a proposal is re-validated (${stale.status})`);
  hist = (await admin.get('/timetable/history?limit=3')).body;
  const gen = hist.find((h) => h.action === 'GENERATE');
  ok(!!gen, `history: ${gen?.summary}`);
  // Undo both generations (latest first) to restore the seeded timetable.
  for (const h of hist.filter((x) => x.action === 'GENERATE' && x.undoable)) {
    const u = await admin.post(`/timetable/history/${h.batchId}/undo`);
    ok(u.status === 201, `generation undone (${u.body.restored ?? u.body.message})`);
  }
  await admin.patch(`/timetable/sessions/${lesson.id}/lock`, { locked: false });

  console.log('Roles');
  ok((await teacher.post('/timetable/generate/preview', { scope: 'all' })).status === 403, 'a teacher cannot generate');
  ok((await teacher.patch(`/timetable/sessions/${lesson.id}/lock`, { locked: true })).status === 403, 'a teacher cannot lock');
  ok((await teacher.get('/timetable/compliance')).status === 200, 'a teacher can read compliance');

  console.log('Exports');
  for (const [format, view, id] of [['pdf', 'class', klass.id], ['xlsx', 'teacher', ''], ['pdf', 'room', '']]) {
    const r = await admin.raw(`/timetable/export?format=${format}&view=${view}${id ? `&id=${id}` : ''}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const magic = format === 'pdf' ? buf.slice(0, 4).toString() === '%PDF' : buf[0] === 0x50 && buf[1] === 0x4b;
    ok(r.status === 200 && magic && buf.length > 1500, `${format} by ${view}: ${buf.length} bytes, ${r.headers.get('content-disposition')}`);
  }

  console.log('Planning import');
  const tpl = await admin.raw('/timetable/planning/template');
  const tplBuf = Buffer.from(await tpl.arrayBuffer());
  ok(tpl.status === 200 && tplBuf[0] === 0x50, `template downloaded (${tplBuf.length} bytes)`);
  const fd = new FormData();
  fd.append('file', new Blob([tplBuf]), 'modele.xlsx');
  const analysis = (await admin.post('/timetable/planning/import/analyze', fd)).body;
  ok(analysis.sheets?.teachers && analysis.sheets?.volumes, `template re-read: ${analysis.summary?.valid} valid, ${analysis.summary?.warnings} warnings, ${analysis.summary?.errors} errors`, analysis.summary);
  const csv = 'Matricule;Nom;Prénoms;Matière(s);Niveaux/classes enseignés;Jour;Heure début;Heure fin\n' +
    'ENS-999;Inconnu;Paul;Maths;6ème;Lundi;08:00;10:00\n' +
    `${res.teachers.find((t) => t.matricule)?.matricule};;;Chimie quantique;6ème;Lundi;10:00;08:00\n` +
    `${res.teachers.find((t) => t.matricule)?.matricule};;;Mathématiques;7ème;Funday;08:00;10:00\n`;
  const fd2 = new FormData();
  fd2.append('file', new Blob([csv], { type: 'text/csv' }), 'professeurs.csv');
  const bad = (await admin.post('/timetable/planning/import/analyze', fd2)).body;
  const msgs = (bad.rows || []).flatMap((r) => r.errors);
  ok(bad.summary?.errors === 3, `CSV errors detected: ${msgs.join(' | ')}`);

  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

function minutes(s) {
  const t = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  return t(s.endTime) - t(s.startTime);
}
function addMinutes(time, m) {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + m;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

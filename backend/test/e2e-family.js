/* End-to-end check of the homework diary and of the conversations between parents and the office.
 * Usage (inside the backend container or in CI): node test/e2e-family.js
 */
const { createPrismaClient } = require('../scripts/prisma-client');
const BASE = process.argv[2] || 'http://localhost:4000/api';
const prisma = createPrismaClient();
const TAG = 'Test-Family';
let failures = 0;
const ok = (cond, label, extra) => {
  if (cond) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
};
const login = async (email, password) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).accessToken;
const client = (token) => (method, path, body) =>
  fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

(async () => {
  const api = client(await login('admin@school.local', 'admin123'));
  const teacher = client(await login('k.kouassi@school.local', 'teach123'));
  const secretary = client(await login('secretaire@school.local', 'secret123'));
  const parent = client(await login('parent@school.local', 'parent123'));
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  try {
    const child = (await parent('GET', '/parent-portal/children')).body[0];
    const enrollment = await prisma.enrollment.findFirst({ where: { studentId: child.id, withdrawalDate: null, class: { academicYear: { isCurrent: true } } } });
    const otherClass = await prisma.class.findFirst({ where: { schoolId: child.schoolId, id: { not: enrollment.classId } } });
    const subject = await prisma.subject.findFirst({ where: { schoolId: child.schoolId } });
    const stranger = await prisma.student.findFirst({ where: { schoolId: child.schoolId, parents: { none: { students: { some: { id: child.id } } } } } });

    console.log('Homework diary');
    const hw = await teacher('POST', '/homework', { classId: enrollment.classId, subjectId: subject.id, title: `${TAG} : exercices 4 à 7 page 52`, description: 'Rédiger sur une feuille double.', dueDate: inDays(3) });
    ok(hw.status === 201 && hw.body.class.name && hw.body.subject.name === subject.name && hw.body.createdByName, `a teacher gives homework to ${hw.body.class?.name} (${hw.body.createdByName})`, hw.body);
    await teacher('POST', '/homework', { classId: otherClass.id, title: `${TAG} : autre classe`, dueDate: inDays(2) });
    ok((await teacher('POST', '/homework', { classId: enrollment.classId, title: `${TAG} passé`, dueDate: inDays(-5) })).status === 400, 'a due date in the past is refused');
    ok((await teacher('POST', '/homework', { classId: 'unknown', title: `${TAG} x`, dueDate: inDays(2) })).status === 404, 'unknown class refused');
    const list = (await teacher('GET', `/homework?classId=${enrollment.classId}`)).body.filter((h) => h.title.startsWith(TAG));
    ok(list.length === 1, 'the class diary lists it');
    const seen = (await parent('GET', `/parent-portal/children/${child.id}/homework`)).body.filter((h) => h.title.startsWith(TAG));
    ok(seen.length === 1 && seen[0].subject === subject.name && seen[0].description === 'Rédiger sur une feuille double.', "the parent sees the homework of the child's class, not of another class", seen);
    ok((await parent('GET', `/parent-portal/children/${stranger.id}/homework`)).status === 403 && (await parent('POST', '/homework', { classId: enrollment.classId, title: `${TAG} parent`, dueDate: inDays(2) })).status === 403, "a parent cannot read another child's diary nor write homework");
    ok((await secretary('DELETE', `/homework/${hw.body.id}`)).status === 403 && (await teacher('DELETE', `/homework/${hw.body.id}`)).status === 200, 'only the author or the management deletes homework');

    console.log('Conversation opened by a parent');
    ok((await parent('POST', '/parent-portal/conversations', { studentId: stranger.id, subject: `${TAG} tentative`, body: 'Bonjour' })).status === 403, "a parent cannot write about another family's child");
    const opened = await parent('POST', '/parent-portal/conversations', { studentId: child.id, subject: `${TAG} : rendez-vous`, body: 'Bonjour, puis-je rencontrer le professeur principal ?' });
    ok(opened.status === 201 && opened.body.messages.length === 1 && opened.body.messages[0].fromParent === true, 'conversation opened with its first message', opened.body);
    const id = opened.body.id;
    const inbox = await secretary('GET', `/conversations?page=1&q=${encodeURIComponent(TAG)}`);
    ok(inbox.status === 200 && inbox.body.items[0].id === id && inbox.body.items[0].unreadBySchool === true && inbox.body.unread >= 1 && inbox.body.items[0].parent.lastName, 'the office sees it as unread, with the parent');
    const notified = await prisma.notification.findFirst({ where: { subject: 'Message d’un parent', message: { contains: TAG } } });
    ok(!!notified, 'and is notified');
    ok((await teacher('GET', '/conversations')).status === 403, 'teachers do not read the office mailbox');

    console.log('Answer and follow-up');
    const read = await secretary('GET', `/conversations/${id}`);
    ok(read.body.unreadBySchool === false, 'opening the conversation marks it as read');
    const reply = await secretary('POST', `/conversations/${id}/messages`, { body: 'Bonjour, mardi à 16 h vous conviendrait-il ?' });
    ok(reply.status === 201 && reply.body.messages.length === 2 && reply.body.messages[1].fromParent === false && reply.body.unreadByParent === true, 'the office answers');
    const mine = (await parent('GET', '/parent-portal/conversations')).body.find((c) => c.id === id);
    ok(mine.unreadByParent === true, 'the parent sees an unread answer');
    const thread = await parent('GET', `/parent-portal/conversations/${id}`);
    ok(thread.body.messages.length === 2 && thread.body.unreadByParent === false && !('authorId' in thread.body.messages[1]), 'reading it clears the mark; no internal identifier is sent');
    const back = await parent('POST', `/parent-portal/conversations/${id}/messages`, { body: 'Parfait, merci.' });
    ok(back.status === 200 && back.body.messages.length === 3, 'the parent replies');
    ok((await parent('POST', `/parent-portal/conversations/${id}/messages`, { body: ' ' })).status === 400, 'an empty message is refused');
    const closed = await secretary('PATCH', `/conversations/${id}/close`);
    ok(closed.body.status === 'CLOSED' && (await parent('POST', `/parent-portal/conversations/${id}/messages`, { body: 'Encore une question' })).status === 400, 'once closed, the parent opens a new conversation instead');
    ok((await api('GET', `/conversations/${id}`)).status === 200 && (await api('GET', '/conversations/does-not-exist')).status === 404, 'unknown conversation: 404');
  } finally {
    await prisma.conversation.deleteMany({ where: { subject: { startsWith: TAG } } });
    await prisma.homework.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.notification.deleteMany({ where: { message: { contains: TAG } } });
    await prisma.notification.deleteMany({ where: { subject: "Réponse de l'établissement", message: { startsWith: TAG } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

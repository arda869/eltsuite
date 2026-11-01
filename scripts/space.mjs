// How much space each teacher's files take, measured here rather than trusted from the app:
// their library (users/{uid}/archive) and the files they own (sharedDocs). A teacher over their
// space gets accounts/{uid}.over = true, and the database rules stop new uploads until they are
// under it again. Runs every 15 minutes from GitHub Actions, with the deploy key.
import { purgeFileBin } from './file-bin-cleanup.mjs';
import { getDatabase } from 'firebase-admin/database';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit', databaseURL: 'https://lesson-lit-default-rtdb.asia-southeast1.firebasedatabase.app' });
const db = getFirestore();
try { console.log(`Recycle bin: ${await purgeFileBin(db, getDatabase())} files permanently deleted.`); }
catch (e) { console.error('Recycle bin cleanup incomplete; retained files still count towards storage: ' + e.message); }
const GB = 1024 ** 3;
const PLAN_GB = { free: 1, teacher: 10, school: 50 };

const [teachers, accounts, orgs] = await Promise.all([
  db.collection('users').where('role', '==', 'teacher').get(),
  db.collection('accounts').get(),
  db.collection('orgs').get(),
]);
const acc = new Map(accounts.docs.map((d) => [d.id, d.data()]));
const org = new Map(orgs.docs.map((d) => [d.id, d.data()]));
let changed = 0;
const usedBy = new Map(); // uid → bytes, for each organisation's total below
for (const t of teachers.docs) {
  const uid = t.id;
  const a = acc.get(uid) ?? {};
  const [items, docs, videoAssets, videoProjects] = await Promise.all([db.collection('users').doc(uid).collection('archive').select('size', 'copies', 'home', 'thumb').get(), db.collection('sharedDocs').where('owner', '==', uid).select('size').get(), db.collection('videoAssets').where('owner', '==', uid).select('size').get(), db.collection('users').doc(uid).collection('videoProjects').get()]);
  let used = 0;
  for (const i of items.docs) {
    const x = i.data();
    const copies = Object.keys(x.copies ?? {}).filter((c) => c !== x.home?.classId).length;
    used += (Number(x.size) || 0) * (1 + copies) + (typeof x.thumb === 'string' ? x.thumb.length : 0);
  }
  for (const d of docs.docs) used += Number(d.data().size) || 0;
  for (const a of videoAssets.docs) used += Number(a.get('size')) || 0;
  for (const p of videoProjects.docs) used += JSON.stringify(p.data()).length;
  // Lessons take space too: every task in the teacher's classes, and lessons kept in Files.
  let lessons = 0;
  const classes = await db.collection('classes').where('teacherId', '==', uid).get();
  for (const c of classes.docs) {
    if (c.data().status === 'deleted') continue;
    for (const item of (await c.ref.collection('items').get()).docs) {
      lessons += JSON.stringify(item.data()).length;
      for (const t of (await item.ref.collection('tasks').get()).docs) lessons += JSON.stringify(t.data()).length;
    }
  }
  const lessonFiles = await db.collection('sharedDocs').where('owner', '==', uid).where('kind', '==', 'lesson').get();
  for (const f of lessonFiles.docs) for (const t of (await f.ref.collection('tasks').get()).docs) lessons += JSON.stringify(t.data()).length;
  used += lessons;
  const o = a.org ? org.get(a.org) : null;
  const gb = o ? Number(o.teachers?.[uid]?.gb ?? o.perTeacherGb ?? 1) : Number(a.limitGb ?? PLAN_GB[a.plan] ?? 1);
  usedBy.set(uid, used);
  // An organisation past its space in all (as measured last time) stops new uploads for all its teachers.
  const orgOver = !!o && Number(o.usage?.bytes ?? 0) > Number(o.limitGb ?? 50) * GB;
  const over = used > gb * GB || orgOver;
  if (a.over === over && Math.abs((a.usedBytes ?? 0) - used) < 100_000 && Math.abs((a.lessonBytes ?? 0) - lessons) < 50_000) continue;
  await db.collection('accounts').doc(uid).set({ over, usedBytes: used, lessonBytes: lessons, measuredAt: FieldValue.serverTimestamp() }, { merge: true });
  changed++;
}
console.log(`Space measured for ${teachers.size} teachers; ${changed} updated.`);

// What each organisation uses, against the limits a super admin sets (orgs/{id}.limits): classes,
// learners and space. The app counts classes and learners up at once as they are added; this
// recounts them, so classes deleted or learners removed free their place. Call minutes: video.mjs.
for (const od of orgs.docs) {
  const o = od.data();
  const classes = await db.collection('classes').where('org', '==', od.id).select('status', 'learnerCount').get();
  const live = classes.docs.filter((c) => c.data().status !== 'deleted');
  const learners = live.reduce((n, c) => n + Math.max(0, Number(c.data().learnerCount ?? 0)), 0);
  const bytes = Object.keys(o.teachers ?? {}).reduce((n, uid) => n + (usedBy.get(uid) ?? Number(acc.get(uid)?.usedBytes ?? 0)), 0);
  const u = o.usage ?? {};
  if (u.classes === live.length && u.learners === learners && Math.abs((u.bytes ?? 0) - bytes) < 1_000_000) continue;
  await od.ref.update({ 'usage.classes': live.length, 'usage.learners': learners, 'usage.bytes': bytes, 'usage.at': Date.now() });
}
console.log(`Usage counted for ${orgs.size} organisations.`);

// Activity (usage/{uid}/visits) is kept for 90 days: older visits are removed here.
{
  const cutoff = Date.now() - 90 * 864e5;
  let gone = 0;
  for (const u of (await db.collection('usage').select().get()).docs) {
    const old = await u.ref.collection('visits').where('start', '<', cutoff).limit(200).get();
    if (old.empty) continue;
    const b = db.batch();
    old.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
    gone += old.size;
  }
  if (gone) console.log(`Removed ${gone} visits older than 90 days.`);
}

// How much space each teacher's files take, measured here rather than trusted from the app:
// their library (users/{uid}/archive) and the files they own (sharedDocs). A teacher over their
// space gets accounts/{uid}.over = true, and the database rules stop new uploads until they are
// under it again. Runs every 15 minutes from GitHub Actions, with the deploy key.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
const db = getFirestore();
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
for (const t of teachers.docs) {
  const uid = t.id;
  const a = acc.get(uid) ?? {};
  const [items, docs] = await Promise.all([db.collection('users').doc(uid).collection('archive').select('size', 'copies', 'home', 'thumb').get(), db.collection('sharedDocs').where('owner', '==', uid).select('size').get()]);
  let used = 0;
  for (const i of items.docs) {
    const x = i.data();
    const copies = Object.keys(x.copies ?? {}).filter((c) => c !== x.home?.classId).length;
    used += (Number(x.size) || 0) * (1 + copies) + (typeof x.thumb === 'string' ? x.thumb.length : 0);
  }
  for (const d of docs.docs) used += Number(d.data().size) || 0;
  const o = a.org ? org.get(a.org) : null;
  const gb = o ? Number(o.teachers?.[uid]?.gb ?? o.perTeacherGb ?? 1) : Number(a.limitGb ?? PLAN_GB[a.plan] ?? 1);
  const over = used > gb * GB;
  if (a.over === over && Math.abs((a.usedBytes ?? 0) - used) < 100_000) continue;
  await db.collection('accounts').doc(uid).set({ over, usedBytes: used, measuredAt: FieldValue.serverTimestamp() }, { merge: true });
  changed++;
}
console.log(`Space measured for ${teachers.size} teachers; ${changed} updated.`);

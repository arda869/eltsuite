// Disposable emulator only; never reads or writes a production account.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Firestore emulator required.');
const env = await initializeTestEnvironment({ projectId: 'demo-feature-discovery', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
const data = () => ({ settings: { tracking: true, enabled: true, gapDays: 7, quietStart: 20, quietEnd: 8, pausedUntil: 0 }, usage: { lessons: { count: 1, lastUsed: 1793404800000, events: ['a'.repeat(64)], guided: false } }, feedback: { notes: { guideStarted: true } }, delivery: { feature: 'notes', at: 1793404800000, read: false } });
try {
  await env.withSecurityRulesDisabled(async c => {
    for (const uid of ['teacher', 'other', 'admin', 'paused']) await setDoc(doc(c.firestore(), 'users', uid), { role: 'teacher' });
    await setDoc(doc(c.firestore(), 'users', 'learner'), { role: 'learner' });
    await setDoc(doc(c.firestore(), 'accounts', 'paused'), { suspended: true });
  });
  const as = (uid, extra = {}) => env.authenticatedContext(uid, { email: uid === 'admin' ? 'ardanurioglu@gmail.com' : uid + '@example.com', email_verified: true, ...extra }).firestore();
  const teacher = as('teacher'), target = doc(teacher, 'featureDiscovery', 'teacher');
  await assertSucceeds(setDoc(target, data()));
  await assertSucceeds(getDoc(target));
  for (const db of [as('other'), as('learner'), as('admin'), as('teacher', { proxyBy: 'admin' }), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(db, 'featureDiscovery', 'teacher')));
    await assertFails(setDoc(doc(db, 'featureDiscovery', 'teacher'), data()));
  }
  for (const uid of ['learner', 'paused']) await assertFails(setDoc(doc(as(uid), 'featureDiscovery', uid), data()));
  await assertFails(setDoc(target, { ...data(), privateLessonText: 'Not permitted' }));
  await assertFails(setDoc(target, { ...data(), usage: { nonexistent: { count: 1 } } }));
  await assertFails(setDoc(target, { ...data(), settings: { ...data().settings, gapDays: 0 } }));
  await assertFails(setDoc(target, { ...data(), settings: { ...data().settings, tracking: false } }));
  await assertFails(setDoc(target, { ...data(), usage: { lessons: { ...data().usage.lessons, count: -1 } } }));
  await assertFails(setDoc(target, { ...data(), usage: { lessons: { ...data().usage.lessons, events: Array(81).fill('x') } } }));
  await assertSucceeds(setDoc(target, { ...data(), usage: {}, feedback: {}, settings: { ...data().settings, tracking: false, enabled: false }, delivery: { feature: '', at: 0, read: true } }));
  await assertSucceeds(deleteDoc(target));
  console.log('Discovery rules passed: self-only teacher access, no admin or proxy access, schema limits, opt-out and deletion.');
} finally { await env.cleanup(); }

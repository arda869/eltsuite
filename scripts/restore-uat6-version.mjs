// One-time repair for the hidden task used in UAT 6. No learner data is read or changed.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const action = process.argv[2];
if (action !== 'inspect' && action !== 'restore') throw new Error('Expected inspect or restore.');

initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
const db = getFirestore();
const classId = 'C0MTief4WLnRAAg0JeAN';
const itemId = 'QebCvQUEiv8AJXAWZOww';
const tasks = await db.collection('classes').doc(classId).collection('items').doc(itemId).collection('tasks').get();
const matches = tasks.docs.filter((doc) => {
  const task = doc.data();
  return task.title === 'New task (copy)' && task.variant === 'A' && task.hidden === true && task.locked === true;
});
if (matches.length !== 1) throw new Error(`Expected exactly one hidden, locked Version A UAT task; found ${matches.length}. No changes made.`);
const ref = matches[0].ref;
const before = matches[0].data();
console.log(`UAT task found. Distribution: ${before.dist?.mode ?? 'unset'}.`);
if (action === 'restore') {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('title') !== 'New task (copy)' || snap.get('variant') !== 'A' || snap.get('hidden') !== true || snap.get('locked') !== true || snap.get('dist.mode') !== 'role') {
      throw new Error('UAT task changed since inspection; no changes made.');
    }
    tx.update(ref, { 'dist.mode': 'same' });
  });
  const after = await ref.get();
  if (after.get('dist.mode') !== 'same') throw new Error('Read-back did not confirm the restored setting.');
  console.log('Verified: distribution is Same for everyone.');
}
await db.terminate();

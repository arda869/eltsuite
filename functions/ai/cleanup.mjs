// Remove expired temporary AI jobs only. Private drafts and spending ledgers persist.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
const db = getFirestore();
const cutoff = Timestamp.now();
let deleted = 0;
// listDocuments includes missing parent documents with subcollections. Query each
// user's jobs so no collection-group index or index-admin permission is needed.
for (const owner of await db.collection('aiPrivate').listDocuments()) {
  for (let page = 0; page < 20; page++) {
    const snapshot = await owner.collection('jobs').where('expiresAt', '<=', cutoff).limit(400).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    for (const job of snapshot.docs) batch.delete(job.ref);
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < 400) break;
  }
}
console.log(`Removed ${deleted} expired temporary assistant jobs. Drafts and budgets were retained.`);

// Song previews last 24 hours; saved Resources recordings use their own media documents.
for (const owner of await db.collection('songPrivate').listDocuments()) {
  for (let page = 0; page < 20; page++) {
    const snapshot = await owner.collection('jobs').where('expiresAt', '<=', Date.now()).limit(200).get();
    if (snapshot.empty) break;
    for (const job of snapshot.docs) {
      await db.recursiveDelete(job.ref);
    }
    if (snapshot.size < 200) break;
  }
}

// Help feedback and fair-use counters have a bounded retention window too.
for (const owner of await db.collection('helpPrivate').listDocuments()) {
  for (let page = 0; page < 20; page++) {
    const snapshot = await owner.collection('usage').where('expiresAt', '<=', cutoff).limit(400).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    for (const record of snapshot.docs) batch.delete(record.ref);
    await batch.commit();
    if (snapshot.size < 400) break;
  }
}
for (let page = 0; page < 20; page++) {
  const snapshot = await db.collection('helpFeedback').where('expiresAt', '<=', cutoff).limit(400).get();
  if (snapshot.empty) break;
  const batch = db.batch();
  for (const record of snapshot.docs) batch.delete(record.ref);
  await batch.commit();
  if (snapshot.size < 400) break;
}

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

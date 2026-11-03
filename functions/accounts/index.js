import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { requestDeletion, processDeletion } from './service.js';
export const deleteAccount = onCall({ region: 'us-central1', maxInstances: 2 }, req => requestDeletion(getFirestore(), getAuth(), req.auth, req.data));
export const finishAccountDeletion = onDocumentCreated({ document: 'accountDeletions/{uid}', region: 'us-central1', timeoutSeconds: 540, retry: true }, event => processDeletion(getFirestore(), getAuth(), getDatabase(undefined, 'https://lesson-lit-default-rtdb.asia-southeast1.firebasedatabase.app'), event.params.uid));
export const retryAccountDeletions = onSchedule({ schedule: 'every 15 minutes', region: 'us-central1', timeoutSeconds: 540, maxInstances: 1 }, async () => {
  const db = getFirestore();
  const jobs = await db.collection('accountDeletions').where('status', '==', 'pending').limit(10).get();
  for (const job of jobs.docs) await processDeletion(db, getAuth(), getDatabase(undefined, 'https://lesson-lit-default-rtdb.asia-southeast1.firebasedatabase.app'), job.id);
});

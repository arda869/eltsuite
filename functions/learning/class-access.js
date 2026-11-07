import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

const RTDB = 'https://lesson-lit-default-rtdb.asia-southeast1.firebasedatabase.app';
const validId = id => typeof id === 'string' && id.length > 0 && id.length < 150 && !id.includes('/');

export async function syncClassAccess(db, realtime, classId, requester) {
  if (!validId(classId)) throw new HttpsError('invalid-argument', 'Choose a class.');
  const snap = await db.doc(`classes/${classId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'This class no longer exists.');
  const c = snap.data();
  const teachers = Object.fromEntries(Object.entries(c.coTeachers ?? {})
    .filter(([, entry]) => entry?.role === 'co').map(([uid]) => [uid, true]));
  if (requester && requester !== c.teacherId && !teachers[requester])
    throw new HttpsError('permission-denied', 'Only this class’s teachers can control the live lesson.');
  await realtime.ref().update({ [`classOwners/${classId}`]: c.teacherId, [`classTeachers/${classId}`]: teachers });
  return { owner: c.teacherId, coTeachers: Object.keys(teachers).length };
}

export const claimLiveClass = onCall({ region: 'us-central1', maxInstances: 10 }, req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (req.auth.token?.proxyBy) throw new HttpsError('permission-denied', 'Live teaching is unavailable in this view.');
  return syncClassAccess(getFirestore(), getDatabase(undefined, RTDB), req.data?.classId, req.auth.uid);
});

export const classTeachingAccessChanged = onDocumentWritten({ document: 'classes/{classId}', region: 'us-central1', maxInstances: 10 }, async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (before && after && before.teacherId === after.teacherId
      && JSON.stringify(before.coTeachers ?? {}) === JSON.stringify(after.coTeachers ?? {})) return;
  if (!event.data?.after.exists) {
    await getDatabase(undefined, RTDB).ref().update({ [`classOwners/${event.params.classId}`]: null, [`classTeachers/${event.params.classId}`]: null });
    return;
  }
  await syncClassAccess(getFirestore(), getDatabase(undefined, RTDB), event.params.classId);
});

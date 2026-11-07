import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export async function deleteLearnerIdentityForClass(db, identities, auth, data) {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token?.proxyBy) throw new HttpsError('permission-denied', 'Leave the learner preview first.');
  const classId = data?.classId;
  const learnerId = data?.learnerId;
  if (typeof classId !== 'string' || !classId || classId.includes('/') || typeof learnerId !== 'string' || !learnerId || learnerId.includes('/'))
    throw new HttpsError('invalid-argument', 'Choose a learner in a class.');
  const classDoc = await db.doc(`classes/${classId}`).get();
  if (!classDoc.exists) throw new HttpsError('not-found', 'This class no longer exists.');
  const c = classDoc.data();
  if (c.teacherId !== auth.uid && c.coTeachers?.[auth.uid]?.role !== 'co')
    throw new HttpsError('permission-denied', 'Only a class teacher can remove learners.');
  const learner = await db.doc(`classes/${classId}/learners/${learnerId}`).get();
  if (!learner.exists) return { deleted: true };
  const uid = learner.get('authUid');
  if (typeof uid !== 'string' || !uid || uid.includes('/')) throw new HttpsError('failed-precondition', 'This learner has no valid sign-in account.');
  const profile = await db.doc(`users/${uid}`).get();
  if (profile.exists && (profile.get('role') !== 'learner' || profile.get('classId') !== classId || profile.get('learnerId') !== learnerId))
    throw new HttpsError('failed-precondition', 'This sign-in account belongs to someone else.');
  try { await identities.deleteUser(uid); }
  catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  return { deleted: true };
}

export const deleteLearnerIdentity = onCall({ region: 'us-central1', maxInstances: 5 }, req =>
  deleteLearnerIdentityForClass(getFirestore(), getAuth(), req.auth, req.data));

import { reserveFeature } from '../ai/feature-usage.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
export async function authorizeTeacher(req) {
  if (!req.auth || req.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in with your own teacher account.');
  const db = getFirestore(), uid = req.auth.uid;
  const [profile, account] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`accounts/${uid}`).get()]);
  if (profile.get('role') !== 'teacher' || account.get('suspended') === true || account.get('over') === true) throw new HttpsError('permission-denied', 'This feature is available to active teacher accounts.');
  return uid;
}
export async function reserveSpeech(auth, feature = 'speech') {
  return reserveFeature(getFirestore(), auth, feature);
}

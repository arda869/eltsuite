import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
export async function authorizeTeacher(req) {
  if (!req.auth || req.auth.token.proxyBy) throw new HttpsError('unauthenticated', 'Sign in with your own teacher account.');
  const db = getFirestore(), uid = req.auth.uid;
  const [profile, account] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`accounts/${uid}`).get()]);
  if (profile.get('role') !== 'teacher' || account.get('suspended') === true || account.get('over') === true) throw new HttpsError('permission-denied', 'This feature is available to active teacher accounts.');
  return uid;
}
export async function reserveSpeech(uid, units = 1) {
  const db = getFirestore(), day = new Date().toISOString().slice(0, 10);
  const own = db.doc(`speechUsage/${day}/teachers/${uid}`), all = db.doc(`speechUsage/${day}`);
  await db.runTransaction(async tx => {
    const [a, b] = await Promise.all([tx.get(own), tx.get(all)]);
    const count = a.get('count') ?? 0, global = b.get('count') ?? 0;
    if (count + units > 100 || global + units > 1000) throw new HttpsError('resource-exhausted', 'Today’s speech allowance has been used. Existing recordings still work; try again tomorrow.');
    tx.set(own, { count: count + units }); tx.set(all, { count: global + units });
  });
}

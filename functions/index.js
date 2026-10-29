// The one piece of ELT Suite that runs on a server: a super admin signs in as a teacher or a
// learner, to see ELT Suite exactly as they do. Only super admins (the owner, or someone in
// superAdmins/{email} with a verified email, as in firestore.rules) can ask; every use is written
// to proxyLog. The pass is a Firebase custom token, good for one sign-in within an hour.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const OWNER = 'ardanurioglu@gmail.com';

async function isSuper(token) {
  const email = String(token?.email ?? '').toLowerCase();
  if (!email) return false;
  if (email === OWNER) return true;
  if (token.email_verified !== true) return false;
  return (await getFirestore().doc(`superAdmins/${email}`).get()).exists;
}

export const signInAs = onCall({ region: 'us-central1', maxInstances: 2 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!(await isSuper(req.auth.token))) throw new HttpsError('permission-denied', 'Only super admins can do this.');
  const uid = typeof req.data?.uid === 'string' ? req.data.uid : '';
  if (!uid || uid === req.auth.uid) throw new HttpsError('invalid-argument', 'Choose someone else.');
  let user;
  try {
    user = await getAuth().getUser(uid);
  } catch {
    throw new HttpsError('not-found', 'There is no account like that.');
  }
  // Not into another super admin: they can sign in themselves.
  if (await isSuper({ email: user.email, email_verified: user.emailVerified })) throw new HttpsError('permission-denied', 'You can’t sign in as another super admin.');
  await getFirestore().collection('proxyLog').add({ by: req.auth.uid, byEmail: req.auth.token.email ?? '', uid, email: user.email ?? '', at: FieldValue.serverTimestamp() });
  const token = await getAuth().createCustomToken(uid, { proxyBy: req.auth.uid });
  return { token, name: user.displayName || user.email || 'this person' };
});

import { createHash } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const normalName = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

export async function resolveLearner(db, { code, name, address }) {
  if (!/^[A-Z]{3}-\d{3}$/.test(code ?? '') || typeof name !== 'string' || name.length < 2 || name.length > 100)
    throw new HttpsError('invalid-argument', 'Enter the class code and your full name.');
  // A class code must never return a roster. Bound name guesses even when the caller has no account.
  const window = Math.floor(Date.now() / 300000);
  const id = value => createHash('sha256').update(value).digest('hex');
  const shared = db.doc(`joinLookupLimits/ip_${id(`${address}|${code}|${window}`)}`);
  const person = db.doc(`joinLookupLimits/name_${id(`${address}|${code}|${normalName(name)}|${window}`)}`);
  await db.runTransaction(async tx => {
    const [all, one] = await Promise.all([tx.get(shared), tx.get(person)]);
    if ((all.data()?.count ?? 0) >= 100 || (one.data()?.count ?? 0) >= 5)
      throw new HttpsError('resource-exhausted', 'Too many tries. Please wait a few minutes.');
    const patch = { count: FieldValue.increment(1), expiresAt: new Date((window + 2) * 300000) };
    tx.set(shared, patch, { merge: true });
    tx.set(person, patch, { merge: true });
  });
  const snap = await db.doc(`classCodes/${code}`).get();
  const matches = (snap.data()?.roster ?? []).filter(entry => normalName(entry.name) === normalName(name));
  if (matches.length !== 1 || typeof matches[0].id !== 'string')
    throw new HttpsError('not-found', 'We couldn’t match that class code and name. Check with your teacher.');
  return { learnerId: matches[0].id, className: String(snap.get('className') ?? '') };
}

export const resolveLearnerSignIn = onCall({ region: 'us-central1', maxInstances: 10 }, req => {
  const address = req.rawRequest?.ip || req.rawRequest?.socket?.remoteAddress || 'unknown';
  return resolveLearner(getFirestore(), { code: req.data?.code, name: req.data?.name, address });
});

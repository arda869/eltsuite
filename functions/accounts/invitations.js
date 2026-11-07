import { createHash } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const clip = (v, max) => String(v ?? '').trim().slice(0, max);
const hash = value => createHash('sha256').update(value).digest('hex');

export async function createInvitationRequest(db, data, address, now = Date.now()) {
  const email = clip(data?.email, 120).toLowerCase();
  const name = clip(data?.name, 80);
  if (!name || !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email))
    throw new HttpsError('invalid-argument', 'Enter your name and a valid email address.');
  const hour = Math.floor(now / 3600000), day = Math.floor(now / 86400000);
  const ipRef = db.doc(`invitationRateLimits/ip_${hash(`${address}|${hour}`)}`);
  const emailRef = db.doc(`invitationRateLimits/email_${hash(`${email}|${day}`)}`);
  const requestRef = db.collection('invitationRequests').doc();
  await db.runTransaction(async tx => {
    const [ip, account] = await Promise.all([tx.get(ipRef), tx.get(emailRef)]);
    if ((ip.get('count') ?? 0) >= 50 || (account.get('count') ?? 0) >= 3)
      throw new HttpsError('resource-exhausted', 'Too many requests. Please try again later.');
    tx.set(ipRef, { count: FieldValue.increment(1), expiresAt: new Date((hour + 2) * 3600000) }, { merge: true });
    tx.set(emailRef, { count: FieldValue.increment(1), expiresAt: new Date((day + 2) * 86400000) }, { merge: true });
    tx.create(requestRef, { name, email, place: clip(data.place, 120), teaches: clip(data.teaches, 60), note: clip(data.note, 600), at: FieldValue.serverTimestamp() });
  });
  return { requested: true };
}

export const requestInvitation = onCall({ region: 'us-central1', maxInstances: 10 }, req =>
  createInvitationRequest(getFirestore(), req.data, req.rawRequest?.ip || req.rawRequest?.socket?.remoteAddress || 'unknown'));

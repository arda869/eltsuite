// The one piece of ELT Suite that runs on a server: a super admin signs in as a teacher or a
// learner, to see ELT Suite exactly as they do. Only super admins (the owner, or someone in
// superAdmins/{email} with a verified email, as in firestore.rules) can ask; every use is written
// to proxyLog. The pass is a Firebase custom token, good for one sign-in within an hour.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getMessaging } from 'firebase-admin/messaging';
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
  let token;
  try {
    token = await getAuth().createCustomToken(uid, { proxyBy: req.auth.uid });
  } catch (e) {
    // Usually the server's account can't sign passes yet (it needs the Service Account Token Creator role).
    console.error('createCustomToken failed', e);
    throw new HttpsError('failed-precondition', `The server couldn’t make a sign-in pass: ${e?.message ?? e}`);
  }
  return { token, name: user.displayName || user.email || 'this person' };
});

// New messages reach phones and computers within seconds. When a chat gets a new message,
// each member who didn't send it and hasn't read it yet gets one notification for that chat.
// scripts/push.mjs still runs every 15 minutes as a back-up: `pushed` stops it sending twice.
export const pushNewMessage = onDocumentUpdated({ document: 'chats/{chatId}', region: 'us-central1', maxInstances: 5 }, async (event) => {
  const before = event.data?.before.data();
  const d = event.data?.after.data();
  if (!d?.last || !d.lastAt || before?.lastAt === d.lastAt) return;
  const db = getFirestore();
  const to = (d.members ?? []).filter((k) => k !== d.last.by && (d.seen?.[k] ?? 0) < d.lastAt && (d.pushed?.[k] ?? 0) < d.lastAt);
  if (!to.length) return;
  const title = d.kind === 'group' ? d.title || 'Group' : d.names?.[d.last.by] ?? 'New message';
  const who = String(d.last.name || '').split(' ')[0];
  const body = d.kind === 'group' ? `${who}: ${d.last.text}` : d.last.text || '';
  const data = { title: String(title).slice(0, 80), body: String(body).slice(0, 180), link: `/messages?c=${event.params.chatId}`, tag: 'chat-' + event.params.chatId };
  const patch = {};
  for (let i = 0; i < to.length; i += 30) {
    const snap = await db.collection('pushTokens').where('key', 'in', to.slice(i, i + 30)).get();
    for (const t of snap.docs) {
      try {
        await getMessaging().send({ token: t.get('token'), data, webpush: { headers: { Urgency: 'high', TTL: '86400' } } });
      } catch (e) {
        const code = e?.errorInfo?.code ?? e?.code ?? '';
        if (/registration-token-not-registered|invalid-registration-token/.test(code)) await t.ref.delete().catch(() => {});
        else console.log('Could not send:', code || e?.message);
      }
    }
  }
  for (const k of to) patch[`pushed.${k}`] = d.lastAt;
  await event.data.after.ref.update(patch);
});

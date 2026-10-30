// The one piece of ELT Suite that runs on a server: a super admin signs in as a teacher or a
// learner, to see ELT Suite exactly as they do. Only super admins (the owner, or someone in
// superAdmins/{email} with a verified email, as in firestore.rules) can ask; every use is written
// to proxyLog. The pass is a Firebase custom token, good for one sign-in within an hour.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { sendDevices } from './push-delivery.js';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
export { lessonAssistant } from './ai/assistant.js';
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
// A real notification part, so the phone shows it itself even when ELT Suite is closed.
// (iPhones don't reliably wake the app to draw data-only messages.)
// Only recipients whose registered devices were accepted by FCM are acknowledged.
async function sendTo(keys, data, ttl) {
  const db = getFirestore();
  const complete = new Set();
  for (let i = 0; i < keys.length; i += 30) {
    const batch = keys.slice(i, i + 30);
    const snap = await db.collection('pushTokens').where('key', 'in', batch).get();
    for (const key of batch) {
      const devices = snap.docs.filter(t => t.get('key') === key).map(t => ({ ...t.data(), id: t.id }));
      const result = await sendDevices(devices, data, ttl, {
        send: message => getMessaging().send(message),
        remove: id => db.collection('pushTokens').doc(id).delete(),
      });
      if (result.complete) complete.add(key);
    }
  }
  return complete;
}

const callBody = (kind, name) => `${name || 'Someone'} is calling you${kind === 'video' ? ' (video)' : ''}. Tap to answer.`;

export const pushNewMessage = onDocumentUpdated({ document: 'chats/{chatId}', region: 'us-central1', maxInstances: 5 }, async (event) => {
  const before = event.data?.before.data();
  const d = event.data?.after.data();
  // A call just started in this chat: everyone else in it gets an incoming call notification.
  const call = d?.call;
  if (call?.at && !call.ended && before?.call?.at !== call.at && Date.now() - call.at < 60e3) {
    const keys = (d.members ?? []).filter((k) => k !== call.by);
    const title = d.kind === 'group' ? d.title || 'Group call' : call.byName || 'Incoming call';
    if (keys.length) await sendTo(keys, { title: String(title).slice(0, 80), body: callBody(call.kind, call.byName), link: `/messages?c=${event.params.chatId}`, tag: 'call-' + event.params.chatId, call: '1' }, 60);
  }
  if (!d?.last || !d.lastAt || before?.lastAt === d.lastAt) return;
  // "Started a call" messages: the call notification already said so.
  if (call?.at && d.last.by === call.by && Math.abs(d.lastAt - call.at) < 15e3) return;
  const to = (d.members ?? []).filter((k) => k !== d.last.by && (d.seen?.[k] ?? 0) < d.lastAt && (d.pushed?.[k] ?? 0) < d.lastAt);
  if (!to.length) return;
  const title = d.kind === 'group' ? d.title || 'Group' : d.names?.[d.last.by] ?? 'New message';
  const who = String(d.last.name || '').split(' ')[0];
  const body = d.kind === 'group' ? `${who}: ${d.last.text}` : d.last.text || '';
  const data = { title: String(title).slice(0, 80), body: String(body).slice(0, 180), link: `/messages?c=${event.params.chatId}`, tag: 'chat-' + event.params.chatId };
  const patch = {};
  const complete = await sendTo(to, data, 86400);
  for (const k of complete) patch[`pushed.${k}`] = d.lastAt;
  if (Object.keys(patch).length) await event.data.after.ref.update(patch);
});

// Someone is called into a call that's already on (a class's video room): their devices ring too.
export const pushCallRing = onDocumentWritten({ document: 'callRings/{key}', region: 'us-central1', maxInstances: 5 }, async (event) => {
  const r = event.data?.after.data();
  const before = event.data?.before.data();
  if (!r?.at || before?.at === r.at || Date.now() - r.at < 0 || Date.now() - r.at > 60e3) return;
  await sendTo([event.params.key], { title: String(r.title || r.byName || 'Incoming call').slice(0, 80), body: callBody(r.kind, r.byName), link: '/', tag: 'ring-' + event.params.key, call: '1' }, 60);
});

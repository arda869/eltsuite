// Phone and computer notifications (web push) for new messages and announcements.
// Runs every 15 minutes from GitHub Actions, with the deploy key. Free: Firebase Cloud Messaging.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
const db = getFirestore();
const fcm = getMessaging();
const now = Date.now();

const tokens = (await db.collection('pushTokens').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
if (!tokens.length) {
  console.log('No devices with notifications on.');
  process.exit(0);
}
const byKey = new Map();
for (const t of tokens) byKey.set(t.key, [...(byKey.get(t.key) ?? []), t]);

const gone = new Set();
async function send(list, n) {
  for (const t of list) {
    if (gone.has(t.id)) continue;
    try {
      await fcm.send({ token: t.token, data: { title: n.title.slice(0, 80), body: n.body.slice(0, 180), link: n.link, tag: n.tag } , webpush: { headers: { Urgency: 'high', TTL: '86400' } } });
    } catch (e) {
      const code = e?.errorInfo?.code ?? e?.code ?? '';
      if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) gone.add(t.id);
      else console.log('Could not send:', code || e?.message);
    }
  }
}

// New messages: one notification per chat for each member who has not read it yet.
let sent = 0;
const chats = await db.collection('chats').where('lastAt', '>', now - 6 * 3600e3).get();
for (const c of chats.docs) {
  const d = c.data();
  if (!d.last) continue;
  const patch = {};
  for (const k of d.members ?? []) {
    const list = byKey.get(k);
    if (!list || d.last.by === k || (d.seen?.[k] ?? 0) >= d.lastAt || (d.pushed?.[k] ?? 0) >= d.lastAt) continue;
    const title = d.kind === 'group' ? d.title || 'Group' : d.names?.[d.last.by] ?? 'New message';
    const who = (d.last.name || '').split(' ')[0];
    await send(list, { title, body: d.kind === 'group' ? `${who}: ${d.last.text}` : d.last.text, link: `/messages?c=${c.id}`, tag: 'chat-' + c.id });
    patch[`pushed.${k}`] = d.lastAt;
    sent++;
  }
  if (Object.keys(patch).length) await c.ref.update(patch);
}

// Announcements sent in the last few hours, once each, to the learners they are for.
const classes = await db.collection('classes').get();
for (const cl of classes.docs) {
  const anns = await cl.ref.collection('announcements').where('sendAt', '>', now - 3 * 3600e3).get();
  for (const a of anns.docs) {
    const v = a.data();
    if (v.pushed || v.sendAt > now) continue;
    const to = tokens.filter((t) => t.role === 'learner' && t.classId === cl.id && (v.to === 'all' || (Array.isArray(v.to) && v.to.includes(t.key))));
    await send(to, { title: cl.data().name || 'Announcement', body: v.text || '', link: '/', tag: 'ann-' + a.id });
    await a.ref.update({ pushed: true });
    sent++;
  }
}

for (const id of gone) await db.collection('pushTokens').doc(id).delete();
console.log(`Sent ${sent} notifications; removed ${gone.size} old devices.`);

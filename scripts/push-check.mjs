// A one-off check of phone notifications, run by .github/workflows/push-check.yml. It writes only
// counts, dates, device types and error codes (never tokens or message text) to push-check.txt.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';
import { writeFileSync } from 'node:fs';

initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
const db = getFirestore();
const out = [];
const say = (...a) => (console.log(...a), out.push(a.join(' ')));
const dev = (ua = '') => (/iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'other') + (/Safari/.test(ua) && !/Chrome/.test(ua) ? ' Safari' : /Chrome/.test(ua) ? ' Chrome' : '');
const when = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) + 'Z' : '—');

const all = await db.collection('pushTokens').get();
say('Devices with notifications on, in all:', all.size);
for (const email of ['ardanurioglu@gmail.com', 'arda@eltsuite.com']) {
  const u = await getAuth().getUserByEmail(email).catch(() => null);
  if (!u) { say(email.replace(/^(..).*@/, '$1…@'), ': no account'); continue; }
  const mine = all.docs.filter((d) => d.get('uid') === u.uid || d.get('key') === u.uid);
  say(`\nAccount ${email.replace(/^(..).*@/, '$1…@')}: ${mine.length} device(s)`);
  for (const t of mine) {
    const at = t.get('at')?.toMillis?.() ?? 0;
    let res = 'sent';
    try {
      await getMessaging().send({ token: t.get('token'), data: { title: 'ELT Suite test', body: 'This is a test notification.', link: '/messages', tag: 'test' }, webpush: { headers: { Urgency: 'high', TTL: '600' }, notification: { title: 'ELT Suite test', body: 'If you see this, notifications work.', icon: '/icons/icon-192.png', tag: 'test' }, fcmOptions: { link: 'https://eltsuite.com/messages' } } });
    } catch (e) {
      res = 'FAILED: ' + (e?.errorInfo?.code ?? e?.code ?? e?.message);
    }
    say(`  - ${dev(t.get('device'))}, registered ${when(at)}, key matches account: ${t.get('key') === u.uid}; test send: ${res}`);
  }
  const chats = await db.collection('chats').where('members', 'array-contains', u.uid).get();
  const recent = chats.docs.map((c) => c.data()).filter((c) => c.last && c.last.by !== u.uid).sort((a, b) => b.lastAt - a.lastAt).slice(0, 5);
  say('  Latest messages to this account:');
  for (const c of recent) say(`  - ${c.kind}, last ${when(c.lastAt)}; opened ${when(c.seen?.[u.uid])}; notified ${when(c.pushed?.[u.uid])}`);
}
writeFileSync('push-check.txt', out.join('\n') + '\n');

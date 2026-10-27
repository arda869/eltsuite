// Video rooms for classes, on Daily (daily.co). Every active class gets its own room; its teachers
// get a host key, kept where only they can read it. Learners join with the room's address, which
// only the class's members can see. Runs every 15 minutes from GitHub Actions, with DAILY_API_KEY.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const KEY = process.env.DAILY_API_KEY;
if (!KEY) {
  console.log('No DAILY_API_KEY secret: video rooms are off until it is added.');
  process.exit(0);
}
initializeApp({ credential: applicationDefault(), projectId: 'lesson-lit' });
const db = getFirestore();
const api = async (path, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch('https://api.daily.co/v1' + path, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
};
const DAY = 864e5;
const classes = await db.collection('classes').where('status', '==', 'active').get();
let made = 0;
for (const c of classes.docs) {
  const v = c.data().video ?? {};
  const host = await c.ref.collection('video').doc('host').get();
  const fresh = host.exists && (host.data().exp ?? 0) * 1000 > Date.now() + 30 * DAY;
  if (v.url && fresh) continue;
  const name = ('c-' + c.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  let room = await api('/rooms', { name, privacy: 'public', properties: { enable_screenshare: true, enable_chat: true, enable_prejoin_ui: true, start_video_off: true, start_audio_off: true, max_participants: 40, enable_people_ui: true } });
  if (!room.ok) room = await api('/rooms/' + name);
  if (!room.ok) {
    console.log('A room could not be made for', c.id, room.status);
    continue;
  }
  const exp = Math.floor((Date.now() + 365 * DAY) / 1000);
  const tok = await api('/meeting-tokens', { properties: { room_name: name, is_owner: true, exp } });
  if (!tok.ok) {
    console.log('No host key for', c.id, tok.status);
    continue;
  }
  await c.ref.set({ video: { url: room.j.url, room: name, at: Date.now() } }, { merge: true });
  await c.ref.collection('video').doc('host').set({ token: tok.j.token, exp });
  made++;
}
console.log(`Video rooms: ${made} made or renewed.`);

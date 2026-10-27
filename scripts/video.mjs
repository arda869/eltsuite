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
  // Rooms made before chat was turned off in calls: turned off once.
  if (v.url && !v.noChat) {
    const u = await api('/rooms/' + v.room, { properties: { enable_chat: false } });
    if (u.ok) await c.ref.set({ video: { ...v, noChat: true } }, { merge: true });
  }
  if (v.url && fresh) continue;
  const name = ('c-' + c.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  let room = await api('/rooms', { name, privacy: 'public', properties: { enable_screenshare: true, enable_chat: false, enable_prejoin_ui: true, start_video_off: true, start_audio_off: true, max_participants: 40, enable_people_ui: true } });
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
  await c.ref.set({ video: { url: room.j.url, room: name, at: Date.now(), noChat: true } }, { merge: true });
  await c.ref.collection('video').doc('host').set({ token: tok.j.token, exp });
  made++;
}
console.log(`Video rooms: ${made} made or renewed.`);

// Ready rooms for calls (chats, meetings, breakout rooms): the app takes one the moment a call
// starts, as rooms can only be made here. Used rooms are deleted after a while and the stock is
// topped up, so an old link never opens a new call.
const POOL = Number(process.env.CALL_POOL || 24);
const pool = db.collection('callRooms');
const all = await pool.get();
let gone = 0;
for (const d of all.docs) {
  const r = d.data();
  const used = r.state === 'used' && Date.now() - (r.usedAt ?? 0) > 8 * 3600e3;
  const old = r.state === 'free' && Date.now() - (r.at ?? 0) > 25 * DAY;
  if (!used && !old) continue;
  await api('/rooms/' + d.id, undefined, 'DELETE');
  await d.ref.delete();
  gone++;
}
for (const d of all.docs) {
  if (d.data().noChat || !d.exists) continue;
  const u = await api('/rooms/' + d.id, { properties: { enable_chat: false } });
  if (u.ok) await d.ref.set({ noChat: true }, { merge: true }).catch(() => {});
}
const free = all.docs.filter((d) => d.data().state === 'free' && Date.now() - (d.data().at ?? 0) <= 25 * DAY).length;
let added = 0;
for (let i = free; i < POOL; i++) {
  const name = 'r-' + [...crypto.getRandomValues(new Uint8Array(10))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  const room = await api('/rooms', { name, privacy: 'public', properties: { exp: Math.floor((Date.now() + 30 * DAY) / 1000), enable_screenshare: true, enable_chat: false, enable_prejoin_ui: false, max_participants: 40, enable_people_ui: true } });
  if (!room.ok) {
    console.log('A call room could not be made', room.status);
    break;
  }
  await pool.doc(name).set({ name, url: room.j.url, state: 'free', at: Date.now(), noChat: true });
  added++;
}
console.log(`Call rooms: ${added} added, ${gone} cleared, ${free + added} ready.`);

// Call links point at a room for as long as a call lasts: old ones go.
const links = await db.collection('callLinks').where('at', '<', Date.now() - 10 * 3600e3).get();
for (const d of links.docs) await d.ref.delete();
console.log(`Call links: ${links.size} old ones cleared.`);

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

// ------------------------------------------------------------------ call minutes, against organisations' limits
// Each organisation can have a limit of call minutes a month (orgs/{id}.limits.callMinutes). Minutes
// are the length of every call in its rooms, from Daily, counted from the 1st of the month (UTC):
// its classes' rooms, and ready rooms its teachers took (remembered in callUse, as used rooms go).
// Past the limit, its classes' rooms do not open until the next month and its teachers start no new
// call (firestore.rules, callRooms); under it again, they open.
try {
  const accounts = new Map((await db.collection('accounts').get()).docs.map((d) => [d.id, d.data()]));
  const orgs = new Map((await db.collection('orgs').get()).docs.map((d) => [d.id, d]));
  const roomOrg = new Map();
  const classRooms = new Map(); // org → [class doc]
  for (const c of classes.docs) {
    const d = c.data();
    const org = d.org || accounts.get(d.teacherId)?.org;
    if (!d.video?.room || !org) continue;
    roomOrg.set(d.video.room, org);
    classRooms.set(org, [...(classRooms.get(org) ?? []), c]);
  }
  for (const r of all.docs) {
    const x = r.data();
    const org = x.by ? accounts.get(x.by)?.org : null;
    if (x.state === 'used' && org) await db.collection('callUse').doc(r.id).set({ org, by: x.by, at: x.usedAt ?? Date.now() }, { merge: true });
  }
  for (const u of (await db.collection('callUse').get()).docs) {
    if (Date.now() - (u.data().at ?? 0) > 40 * DAY) await u.ref.delete();
    else roomOrg.set(u.id, u.data().org);
  }
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const start = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const next = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000);
  const minutes = new Map();
  let after = '';
  for (let page = 0; page < 50; page++) {
    const r = await api(`/meetings?timeframe_start=${start}&limit=100${after ? `&starting_after=${after}` : ''}`);
    const list = r.ok ? r.j.data ?? [] : [];
    for (const m of list) {
      const org = roomOrg.get(m.room);
      if (!org) continue;
      const secs = m.ongoing ? Math.max(Number(m.duration) || 0, Date.now() / 1000 - Number(m.start_time || 0)) : Number(m.duration) || 0;
      minutes.set(org, (minutes.get(org) ?? 0) + secs / 60);
    }
    if (list.length < 100) break;
    after = list[list.length - 1].id;
  }
  for (const [id, od] of orgs) {
    const o = od.data();
    const used = Math.round(minutes.get(id) ?? 0);
    if (o.usage?.month !== month || Math.round(o.usage?.callMinutes ?? -1) !== used) await od.ref.update({ 'usage.callMinutes': used, 'usage.month': month });
    const limit = o.limits?.callMinutes;
    const over = typeof limit === 'number' && used >= limit;
    for (const c of classRooms.get(id) ?? []) {
      const v = c.data().video ?? {};
      if (!!v.paused === over) continue;
      const u = await api('/rooms/' + v.room, { properties: { nbf: over ? next : null } });
      if (u.ok) await c.ref.set({ video: { ...v, paused: over } }, { merge: true });
    }
  }
  console.log(`Call minutes counted for ${orgs.size} organisations.`);
} catch (e) {
  console.error('Call minutes could not be counted', e?.message);
}

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
// Each ready room has a host key, kept where only the teacher who takes the room can read it:
// with it, Daily turns others' microphones and cameras off when that teacher asks.
async function hostKey(name) {
  const tok = await api('/meeting-tokens', { properties: { room_name: name, is_owner: true, exp: Math.floor((Date.now() + 30 * DAY) / 1000) } });
  if (tok.ok) await pool.doc(name).collection('host').doc('key').set({ token: tok.j.token });
  return tok.ok;
}
for (const d of all.docs) {
  if (d.data().state !== 'free' || d.data().hostKey) continue;
  if (await hostKey(d.id)) await d.ref.set({ hostKey: true }, { merge: true }).catch(() => {});
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
  if (await hostKey(name)) await pool.doc(name).set({ hostKey: true }, { merge: true });
  added++;
}
console.log(`Call rooms: ${added} added, ${gone} cleared, ${free + added} ready.`);

// Call links point at a room for as long as a call lasts: old ones go.
const links = await db.collection('callLinks').where('at', '<', Date.now() - 10 * 3600e3).get();
for (const d of links.docs) await d.ref.delete();
console.log(`Call links: ${links.size} old ones cleared.`);

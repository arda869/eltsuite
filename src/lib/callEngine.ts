import { useEffect, useState } from 'react';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import type { OpenCall } from './calls';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { currentOrg } from './admin';

async function hostKeyFor(url: string): Promise<string | undefined> {
  const room = url.split('/').filter(Boolean).pop() ?? '';
  if (!room.startsWith('r-')) return undefined;
  const s = await getDoc(doc(db, 'callRooms', room, 'host', 'key')).catch(() => null);
  return (s?.data()?.token as string | undefined) || undefined;
}

// The call itself, on Daily's call object: no Daily screen, only the camera and microphone
// streams, which our own call screen draws. One call at a time; it lives outside React, so it
// keeps going while the person moves around the app.

export type Tile = {
  id: string;
  name: string;
  local: boolean;
  owner: boolean;
  audio: boolean;
  video: boolean;
  screen: boolean;
  videoTrack?: MediaStreamTrack;
  audioTrack?: MediaStreamTrack;
  screenTrack?: MediaStreamTrack;
  screenAudioTrack?: MediaStreamTrack;
  network?: 'good' | 'warning' | 'bad' | 'unknown';
  joinedAt?: number;
  key?: string; // their ELT Suite id, for their picture
  role?: 'teacher' | 'learner' | 'guest';
  avatar?: string;
  photo?: string;
};
export type Me = { name: string; key?: string; role: 'teacher' | 'learner' | 'guest'; avatar?: string; photo?: string };
// What a teacher can do to everyone, or to one person: off at once, or a request to turn on.
export type HostCmd = 'mute' | 'camOff' | 'askMic' | 'askCam';
export type Device = { id: string; label: string; kind: 'audioinput' | 'videoinput' | 'audiooutput' };
export type EngineState = {
  status: 'idle' | 'joining' | 'joined' | 'error';
  error?: string;
  call: OpenCall | null;
  tiles: Tile[];
  speaker?: string;
  mic: boolean;
  cam: boolean;
  sharing: boolean;
  bg: string; // 'none', 'blur', a picture's address, or 'own' for one the person chose
  noise: boolean; // background noise taken out
  hands: Record<string, number>; // raised hands: participant id → when
  startedAt?: number;
  devices: Device[];
  mics?: string;
  cams?: string;
  ask?: { what: 'mic' | 'cam'; by: string } | null; // a teacher asked you to turn something on
  note?: string | null; // a short note: "Your teacher turned off your microphone"
};

const blank = (): EngineState => ({ status: 'idle', call: null, tiles: [], mic: true, cam: false, sharing: false, bg: 'none', noise: true, hands: {}, devices: [] });
let st: EngineState = blank();
let co: DailyCall | null = null;
let queue: Promise<unknown> = Promise.resolve();
let me: Me = { name: 'Guest', role: 'guest' };
let ended: (() => void) | null = null;
export const onEngineEnded = (f: () => void) => void (ended = f);
const subs = new Set<(s: EngineState) => void>();
const emit = (p: Partial<EngineState>) => {
  st = { ...st, ...p };
  subs.forEach((f) => f(st));
};
export const engineState = () => st;
export function useEngine() {
  const [s, setS] = useState(st);
  useEffect(() => {
    subs.add(setS);
    setS(st);
    return () => void subs.delete(setS);
  }, []);
  return s;
}
export const setCallMe = (m: Me) => void (me = { ...m, name: m.name.trim() || 'Guest' });
export const callMe = () => me;

const track = (p: DailyParticipant, k: 'audio' | 'video' | 'screenVideo' | 'screenAudio') => {
  const t = p.tracks?.[k];
  return t && (t.state === 'playable' || t.state === 'loading' || t.state === 'interrupted') ? t.persistentTrack : undefined;
};
const tileOf = (p: DailyParticipant): Tile => ({
  ...((p.userData as Partial<Tile> | undefined) ?? {}),
  id: p.session_id,
  name: p.user_name || 'Guest',
  local: p.local,
  owner: p.owner,
  audio: p.tracks?.audio?.state === 'playable' || (p.local && p.tracks?.audio?.state === 'sendable'),
  video: p.tracks?.video?.state === 'playable',
  screen: p.tracks?.screenVideo?.state === 'playable',
  videoTrack: track(p, 'video'),
  audioTrack: p.local ? undefined : track(p, 'audio'),
  screenTrack: track(p, 'screenVideo'),
  screenAudioTrack: p.local ? undefined : track(p, 'screenAudio'),
  network: p.networkQualityState,
  joinedAt: p.joined_at ? new Date(p.joined_at).getTime() : undefined,
});
const refresh = () => {
  if (!co) return;
  const all = Object.values(co.participants());
  // You first, then the others in the order they came.
  const tiles = all.map(tileOf).sort((a, b) => Number(b.local) - Number(a.local));
  const me = tiles.find((t) => t.local);
  emit({ tiles, mic: co.localAudio(), cam: co.localVideo(), sharing: !!me?.screen });
  void logTick();
};

async function devices() {
  if (!co) return;
  try {
    const { devices } = await co.enumerateDevices();
    emit({ devices: devices.filter((d) => d.deviceId && d.label).map((d) => ({ id: d.deviceId, label: d.label, kind: d.kind as Device['kind'] })) });
  } catch {
    /* none listed */
  }
}

declare const __BUILD__: string;
// For the screenshots and tests in development only: a pretend call, with painted video.
function pretend(call: OpenCall) {
  const paint = (hue: number) => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 400;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 640, 400);
    grad.addColorStop(0, `hsl(${hue} 30% 42%)`);
    grad.addColorStop(1, `hsl(${hue + 40} 35% 22%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 640, 400);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath();
    g.arc(320, 170, 70, 0, Math.PI * 2);
    g.fill();
    g.fillRect(200, 260, 240, 140);
    return c.captureStream(5).getVideoTracks()[0];
  };
  const n = Number(new URLSearchParams(call.url.split('?')[1] ?? '').get('n') ?? 4);
  const names = ['Mia Chan', 'Leo Wong', 'Sara Lopez', 'Ken Ito', 'Ana Silva', 'Tom Reed', 'Ivy Ho', 'Max Lee'];
  const tiles: Tile[] = [{ id: 'me', name: me.name, local: true, owner: true, audio: true, video: true, screen: false, videoTrack: paint(30), role: me.role, avatar: me.avatar }];
  for (let i = 0; i < n - 1; i++) tiles.push({ id: 'p' + i, name: names[i % names.length], local: false, owner: false, audio: i % 3 !== 1, video: i % 2 === 0, screen: false, videoTrack: i % 2 === 0 ? paint(180 + i * 40) : undefined, role: 'learner' });
  emit({ ...blank(), status: 'joined', call, tiles, startedAt: Date.now() - 754000, speaker: n > 1 ? 'p0' : undefined, hands: n > 2 ? { p1: Date.now() } : {}, mic: true, cam: true });
}

export function startEngine(call: OpenCall) {
  if (__BUILD__ === 'dev' && call.url.startsWith('mock:')) return (pretend(call), Promise.resolve());
  queue = queue.then(async () => {
    await stopNow();
    emit({ ...blank(), status: 'joining', call });
    try {
      const Daily = (await import('@daily-co/daily-js')).default;
      Daily.getCallInstance()?.destroy();
      co = Daily.createCallObject({ subscribeToTracksAutomatically: true });
      const on = (e: string, f: (ev: unknown) => void) => co!.on(e as never, f as never);
      ['participant-joined', 'participant-updated', 'participant-left', 'track-started', 'track-stopped', 'joined-meeting', 'network-quality-change'].forEach((e) => on(e, refresh));
      on('participant-left', (ev) => {
        const id = (ev as { participant?: { session_id?: string } }).participant?.session_id;
        if (id && st.hands[id]) {
          const h = { ...st.hands };
          delete h[id];
          emit({ hands: h });
        }
      });
      on('active-speaker-change', (ev) => emit({ speaker: (ev as { activeSpeaker?: { peerId?: string } }).activeSpeaker?.peerId }));
      on('app-message', (ev) => {
        const { data, fromId } = ev as { data?: { hand?: boolean; cmd?: HostCmd; to?: string }; fromId: string };
        const from = st.tiles.find((t) => t.id === fromId);
        const mine = st.tiles.find((t) => t.local);
        // Only a teacher (or the room's host) can turn things off or ask for them on.
        if (data?.cmd && (from?.role === 'teacher' || from?.owner) && (data.to === '*' || data.to === mine?.id) && mine?.role !== 'teacher') {
          const by = from?.name ?? 'Your teacher';
          if (data.cmd === 'mute' && co?.localAudio()) (co.setLocalAudio(false), emit({ note: `${by} turned off your microphone` }));
          if (data.cmd === 'camOff' && co?.localVideo()) (co.setLocalVideo(false), emit({ note: `${by} turned off your camera` }));
          if (data.cmd === 'askMic' && !co?.localAudio()) emit({ ask: { what: 'mic', by } });
          if (data.cmd === 'askCam' && !co?.localVideo()) emit({ ask: { what: 'cam', by } });
          refresh();
        }
        if (data && 'hand' in data) {
          const h = { ...st.hands };
          if (data.hand) h[fromId] = Date.now();
          else delete h[fromId];
          emit({ hands: h });
        }
      });
      on('camera-error', (ev) => {
        const m = String((ev as { errorMsg?: { errorMsg?: string } }).errorMsg?.errorMsg ?? '');
        emit({ error: /denied|permission|NotAllowed/i.test(m) ? 'The camera or microphone is blocked. Allow them in the address bar, then turn them on again.' : 'The camera or microphone could not be used.' });
      });
      on('error', (ev) => emit({ status: 'error', error: String((ev as { errorMsg?: string }).errorMsg ?? 'The call stopped.') }));
      // Left without asking to (removed by a host, or the room closed): the call ends here too.
      on('left-meeting', () => {
        if (!co) return;
        const c = co;
        co = null;
        void c.destroy().catch(() => {});
        emit({ ...blank() });
        ended?.();
      });
      // A call room you took yourself comes with its host key: Daily then turns microphones and
      // cameras off for you, and you can remove someone.
      const token = call.token ?? (await hostKeyFor(call.url));
      await co.join({ url: call.url, userName: me.name, userData: { key: me.key, role: me.role, avatar: me.avatar, photo: me.photo }, ...(token ? { token } : {}), startVideoOff: call.kind === 'audio' || !!call.camOff, startAudioOff: !!call.micOff });
      emit({ status: 'joined', startedAt: Date.now() });
      refresh();
      void devices();
      if (recall('ll.callNoise', '1') === '1') void setNoise(true);
      const bg = recall('ll.callBg', 'none');
      if (bg !== 'none' && call.kind === 'video') void setBackground(bg);
    } catch (e) {
      console.error(e);
      emit({ status: 'error', error: 'The call could not be joined. Check your connection, then try again.' });
    }
  });
  return queue;
}

async function stopNow() {
  await logFinal().catch(() => {});
  const c = co;
  co = null;
  if (!c) return;
  try {
    await c.leave();
  } catch {
    /* already left */
  }
  try {
    await c.destroy();
  } catch {
    /* gone */
  }
}
// Leaves the call. Returns how many others were still in it.
export function stopEngine() {
  const others = st.tiles.filter((t) => !t.local).length;
  queue = queue.then(async () => {
    await stopNow();
    emit({ ...blank() });
  });
  return others;
}

export const toggleMic = () => co && (co.setLocalAudio(!co.localAudio()), refresh());
export const toggleCam = () => co && (co.setLocalVideo(!co.localVideo()), refresh());
export function toggleShare() {
  if (!co) return;
  if (st.sharing) co.stopScreenShare();
  else co.startScreenShare();
}
// Backgrounds: none, blurred, one of ours, or a picture of your own. Remembered for next time
// (not a picture of your own, which is only kept for this call).
export const BACKGROUNDS = [
  { k: 'study', label: 'Study' },
  { k: 'classroom', label: 'Classroom' },
  { k: 'sage', label: 'Sage' },
  { k: 'paper', label: 'Paper' },
  { k: 'harbour', label: 'Harbour' },
  { k: 'evening', label: 'Evening' },
];
export const bgUrl = (k: string) => `${location.origin}/backgrounds/${k}.jpg`;
const remember = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* fine */
  }
};
const recall = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
export async function setBackground(bg: string, own?: ArrayBuffer) {
  if (!co) return;
  const processor = bg === 'blur' ? { type: 'background-blur' as const, config: { strength: 0.6 } } : bg === 'none' ? { type: 'none' as const } : bg === 'own' && own ? { type: 'background-image' as const, config: { source: own } } : { type: 'background-image' as const, config: { url: bgUrl(bg) } };
  try {
    await co.updateInputSettings({ video: { processor } });
    emit({ bg });
    if (bg !== 'own') remember('ll.callBg', bg);
  } catch {
    emit({ error: 'Backgrounds do not work on this device or browser.' });
  }
}
// Background noise (keyboards, traffic, a fan) taken out of your microphone. On unless turned off.
export async function setNoise(on: boolean) {
  if (!co) return;
  try {
    await co.updateInputSettings({ audio: { processor: { type: on ? 'noise-cancellation' : 'none' } } });
    emit({ noise: on });
    remember('ll.callNoise', on ? '1' : '0');
  } catch {
    emit({ noise: false, error: on ? 'Noise reduction does not work on this device or browser.' : undefined });
  }
}
export function raiseHand(up: boolean) {
  if (!co) return;
  co.sendAppMessage({ hand: up }, '*');
  const me = st.tiles.find((t) => t.local);
  if (!me) return;
  const h = { ...st.hands };
  if (up) h[me.id] = Date.now();
  else delete h[me.id];
  emit({ hands: h });
}
export async function useDevice(kind: 'audioinput' | 'videoinput', id: string) {
  if (!co) return;
  await co.setInputDevicesAsync(kind === 'audioinput' ? { audioDeviceId: id } : { videoDeviceId: id }).catch(() => {});
  emit(kind === 'audioinput' ? { mics: id } : { cams: id });
}
// Teachers: everyone (or one person) off at once, or asked to turn on. Everyone in a call uses
// our call screen, which does as a teacher asks; in a class room the teacher is also the room's
// host, so Daily itself turns them off too.
export function host(cmd: HostCmd, to: string | '*' = '*') {
  if (!co) return;
  // Sent to everyone, with who it is for inside: each screen picks out its own.
  co.sendAppMessage({ cmd, to }, '*');
  // If it has not worked in a few seconds, say so (an old copy of the page, most likely).
  if (cmd === 'mute' || cmd === 'camOff') {
    const ids = to === '*' ? st.tiles.filter((t) => !t.local).map((t) => t.id) : [to];
    window.setTimeout(() => {
      const still = st.tiles.filter((t) => ids.includes(t.id) && (cmd === 'mute' ? t.audio : t.video));
      if (still.length) emit({ note: `${still.map((t) => t.name).join(', ')} still ${still.length > 1 ? 'have' : 'has'} the ${cmd === 'mute' ? 'microphone' : 'camera'} on. Ask them to reload the call page.` });
    }, 3500);
  }
  const meTile = st.tiles.find((t) => t.local);
  if (meTile?.owner && (cmd === 'mute' || cmd === 'camOff')) {
    const ids = to === '*' ? st.tiles.filter((t) => !t.local).map((t) => t.id) : [to];
    co.updateParticipants(Object.fromEntries(ids.map((id) => [id, cmd === 'mute' ? { setAudio: false } : { setVideo: false }])));
  }
}
export const removeOther = (id: string) => co?.updateParticipant(id, { eject: true });
export const clearError = () => emit({ error: undefined });
export const clearAsk = () => emit({ ask: null, note: null });
export const turnOn = (what: 'mic' | 'cam') => {
  if (!co) return;
  if (what === 'mic') co.setLocalAudio(true);
  else co.setLocalVideo(true);
  emit({ ask: null });
  refresh();
};

// ---- Attendance: who was in a call, when, and (unless the organisation turns it off) when
// their microphone and camera were on. One person records each call, at most once a minute and
// once on leaving: whoever started it (for a class, a meeting or a link, the first teacher in
// it). When they leave, the next one takes over. Nobody records who spoke, or for how long.

export type LogSpan = { in: number; out?: number };
export type LogPerson = { name: string; role: 'teacher' | 'learner' | 'guest'; spans: LogSpan[]; mic?: [number, boolean][]; cam?: [number, boolean][] };
export type CallLog = {
  kind: 'chat' | 'class' | 'meeting' | 'link';
  title: string;
  room: string;
  chatId: string | null;
  classId: string | null;
  sessionId: string | null;
  code: string | null;
  startedBy: string;
  startedByName: string;
  startedAt: number;
  endedAt: number | null;
  savedAt: number;
  recorder: string;
  readers: string[];
  media: boolean;
  people: Record<string, LogPerson>;
};
const MAX_MARKS = 300;
let log: { id: string; data: CallLog; dirty: boolean; timer: number } | null = null;
let logOpening = false;
const roomOf = (url: string) => url.split('?')[0].split('/').filter(Boolean).pop() ?? '';
const kindOf = (c: OpenCall): CallLog['kind'] => (c.classId ? 'class' : c.chatId ? 'chat' : c.sessionId ? 'meeting' : 'link');
const keyOf = (t: Tile) => (t.key && t.role !== 'guest' ? t.key : 'guest:' + t.id);
// An organisation can turn off the microphone and camera part: orgs/{id}.policy.recordCallMedia = false.
const mediaOn = () => (currentOrg()?.policy as { recordCallMedia?: boolean } | undefined)?.recordCallMedia !== false;

// The recorder: the first person in the call with an ELT Suite account; for a class, a meeting
// or a link, the first teacher. Everyone works this out the same way, so only one records.
function amRecorder() {
  const c = st.call;
  if (!c || st.status !== 'joined') return false;
  const chat = kindOf(c) === 'chat';
  const who = st.tiles.filter((t) => t.key && t.role !== 'guest' && (chat || t.role === 'teacher')).sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.key).localeCompare(String(b.key)));
  return !!who[0]?.local;
}
// Who may read the record: the class's teachers; the chat's teachers; the meeting's people; the
// link's maker.
async function readersFor(c: OpenCall): Promise<string[]> {
  const uid = auth.currentUser?.uid ?? '';
  try {
    if (c.classId) {
      const d = (await getDoc(doc(db, 'classes', c.classId))).data() ?? {};
      return [...new Set([String(d.teacherId ?? uid), ...Object.keys(d.coTeachers ?? {})])];
    }
    if (c.chatId) {
      const d = (await getDoc(doc(db, 'chats', c.chatId))).data() ?? {};
      return (d.members as string[] ?? []).filter((k) => (d.roles ?? {})[k] === 'teacher');
    }
    if (c.sessionId) {
      const d = (await getDoc(doc(db, 'sessions', c.sessionId))).data() ?? {};
      return [...new Set([String(d.owner ?? uid), ...((d.attendees as string[]) ?? [])])];
    }
    if (c.code) {
      const d = (await getDoc(doc(db, 'callLinks', c.code))).data();
      if (d?.by) return [String(d.by)];
    }
  } catch {
    /* fall through */
  }
  return uid && me.role === 'teacher' ? [uid] : [];
}
async function openLog() {
  if (log || logOpening || !co || !st.call) return;
  logOpening = true;
  try {
    const c = st.call;
    const sid = co.meetingSessionSummary?.()?.id;
    if (!sid || !me.key) return;
    const id = `${roomOf(c.url)}_${sid}`;
    const now = Date.now();
    const old = await getDoc(doc(db, 'callLogs', id)).catch(() => null);
    let data: CallLog;
    if (old?.exists()) {
      data = old.data() as CallLog;
      // Taking over: anyone the last recorder had in the call who is gone now left at its last save.
      const here = new Set(st.tiles.map(keyOf));
      for (const [k, p] of Object.entries(data.people ?? {})) {
        const last = p.spans[p.spans.length - 1];
        if (last && last.out === undefined && !here.has(k)) last.out = data.savedAt;
      }
      data.endedAt = null;
    } else {
      data = {
        kind: kindOf(c),
        title: c.title,
        room: roomOf(c.url),
        chatId: c.chatId ?? null,
        classId: c.classId ?? null,
        sessionId: c.sessionId ?? null,
        code: c.code ?? null,
        startedBy: me.key,
        startedByName: me.name,
        startedAt: Math.min(now, ...st.tiles.map((t) => t.joinedAt ?? now)),
        endedAt: null,
        savedAt: now,
        recorder: me.key,
        readers: await readersFor(c),
        media: mediaOn(),
        people: {},
      };
    }
    data.recorder = me.key;
    log = { id, data, dirty: true, timer: window.setInterval(() => void saveLog(), 60_000) };
    markPeople();
    void saveLog();
  } finally {
    logOpening = false;
  }
}
// What the recorder sees now: who came, who went, microphones and cameras.
function markPeople() {
  if (!log) return;
  const now = Date.now();
  const d = log.data;
  const here = new Map(st.tiles.map((t) => [keyOf(t), t]));
  for (const [k, t] of here) {
    const p = (d.people[k] ??= { name: t.name, role: t.role ?? 'guest', spans: [], ...(d.media ? { mic: [], cam: [] } : {}) });
    if (p.name !== t.name) p.name = t.name;
    const last = p.spans[p.spans.length - 1];
    if (!last || last.out !== undefined) {
      p.spans.push({ in: !last && t.joinedAt && t.joinedAt > d.startedAt - 60_000 ? Math.min(t.joinedAt, now) : now });
      log.dirty = true;
    }
    if (d.media) {
      for (const [list, on] of [
        [(p.mic ??= []), t.audio],
        [(p.cam ??= []), t.video],
      ] as [[number, boolean][], boolean][]) {
        if (!list.length || list[list.length - 1][1] !== on) {
          list.push([now, on]);
          if (list.length > MAX_MARKS) list.splice(0, list.length - MAX_MARKS);
          log.dirty = true;
        }
      }
    }
  }
  for (const [k, p] of Object.entries(d.people)) {
    const last = p.spans[p.spans.length - 1];
    if (last && last.out === undefined && !here.has(k)) {
      last.out = now;
      log.dirty = true;
    }
  }
}
async function saveLog() {
  if (!log || !log.dirty) return;
  log.data.savedAt = Date.now();
  log.dirty = false;
  await setDoc(doc(db, 'callLogs', log.id), JSON.parse(JSON.stringify(log.data))).catch((e) => {
    console.warn('The attendance record could not be saved', e);
    if (log) log.dirty = true;
  });
}
async function logTick() {
  if (amRecorder()) {
    if (!log) return void openLog();
    markPeople();
    return;
  }
  // Someone else records now (an earlier teacher came in): hand over with a last save.
  if (log) {
    const l = log;
    window.clearInterval(l.timer);
    await saveLog();
    if (log === l) log = null;
  }
}
// Leaving: my own time ends now; if nobody is left, the call has ended.
async function logFinal() {
  if (!log) return;
  const l = log;
  window.clearInterval(l.timer);
  const now = Date.now();
  const d = l.data;
  const others = st.tiles.filter((t) => !t.local).map(keyOf);
  for (const [k, p] of Object.entries(d.people)) {
    const last = p.spans[p.spans.length - 1];
    if (last && last.out === undefined && (k === me.key || !others.includes(k))) last.out = now;
  }
  if (!others.length) d.endedAt = now;
  l.dirty = true;
  await saveLog();
  log = null;
}

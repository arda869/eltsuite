// Music for the quiz show's big screen. Five moments, each a track: the lobby, a question, the last
// seconds of a question, the leaderboard and the podium. ELT Suite's own set lives in public/quiz-music
// (made by scripts/quiz-music/compose.py); a super admin can replace any track for everyone in
// Super Admin → Sounds for everyone. Phones stay quiet: only the host's screen plays music.
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type Moment = 'lobby' | 'question' | 'hurry' | 'leaderboard' | 'podium';
export const MOMENTS: { id: Moment; name: string; about: string; loop: boolean }[] = [
  { id: 'lobby', name: 'Lobby', about: 'While players join.', loop: true },
  { id: 'question', name: 'Question', about: 'While a question is open.', loop: true },
  { id: 'hurry', name: 'Last seconds', about: 'The last five seconds of a question.', loop: true },
  { id: 'leaderboard', name: 'Leaderboard', about: 'Between questions.', loop: true },
  { id: 'podium', name: 'Podium', about: 'The winners, at the end. Plays once.', loop: false },
];
/** Exact loop lengths of the built-in tracks (bars × beats ÷ tempo), so they repeat without a gap. */
const BUILT_IN_LOOP: Record<Moment, number> = { lobby: (16 * 4 * 60) / 118, question: (8 * 4 * 60) / 128, hurry: (4 * 4 * 60) / 150, leaderboard: (8 * 4 * 60) / 104, podium: 0 };

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let volume = 0.8;
let muted = false;
type Playing = { moment: Moment; src: AudioBufferSourceNode; gain: GainNode };
let current: Playing | null = null;
let pending: Moment | null = null;
const buffers = new Map<Moment, Promise<{ buffer: AudioBuffer; loopEnd: number } | null>>();

function audio() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = muted ? 0 : volume;
    out.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
/** Call from a click (Browsers only allow sound after one). */
export const unlockMusic = () => {
  try {
    audio();
  } catch {
    /* no audio on this device */
  }
};

/** An uploaded track, put back together from its chunks. */
async function uploaded(moment: Moment): Promise<ArrayBuffer | null> {
  try {
    const meta = (await getDoc(doc(db, 'quizMusic', moment))).data();
    if (!meta?.chunks) return null;
    const parts = (await getDocs(collection(db, 'quizMusic', moment, 'chunks'))).docs.sort((a, b) => Number(a.id) - Number(b.id)).map((d) => String(d.data().data || ''));
    if (parts.length !== meta.chunks) return null;
    const bin = atob(parts.join(''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

function load(moment: Moment) {
  if (!buffers.has(moment)) {
    buffers.set(
      moment,
      (async () => {
        const a = audio();
        if (!a) return null;
        const custom = await uploaded(moment);
        const data = custom ?? (await fetch(`/quiz-music/${moment}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
        if (!data) return null;
        try {
          const buffer = await a.decodeAudioData(data);
          const loopEnd = custom ? buffer.duration : Math.min(buffer.duration, BUILT_IN_LOOP[moment] || buffer.duration);
          return { buffer, loopEnd };
        } catch {
          return null;
        }
      })(),
    );
  }
  return buffers.get(moment)!;
}
/** Start fetching every track so the first question doesn't wait. */
export const preloadMusic = () => MOMENTS.forEach((m) => void load(m.id));
/** Forget loaded tracks (after a super admin uploads a new one). */
export const forgetMusic = (moment?: Moment) => (moment ? buffers.delete(moment) : buffers.clear());

/** Play a moment's track, fading from whatever is playing. Playing the same moment again does nothing. */
export async function playMusic(moment: Moment, fade = 0.6) {
  if (current?.moment === moment) return;
  const a = audio();
  if (!a || !out) return;
  stopMusic(fade);
  const want = moment;
  pending = want;
  const t = await load(moment);
  if (!t || pending !== want) return;
  const src = a.createBufferSource();
  src.buffer = t.buffer;
  const loop = MOMENTS.find((m) => m.id === moment)!.loop;
  src.loop = loop;
  if (loop) {
    src.loopStart = 0;
    src.loopEnd = t.loopEnd;
  }
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.0001, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(1, a.currentTime + Math.max(0.05, fade));
  src.connect(gain).connect(out);
  src.start();
  current = { moment, src, gain };
  src.onended = () => {
    if (current?.src === src) current = null;
  };
}
export function stopMusic(fade = 0.6) {
  pending = null;
  const c = current;
  current = null;
  if (!c || !ctx) return;
  const t = ctx.currentTime;
  c.gain.gain.cancelScheduledValues(t);
  c.gain.gain.setValueAtTime(Math.max(0.0001, c.gain.gain.value), t);
  c.gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
  try {
    c.src.stop(t + Math.max(0.05, fade) + 0.05);
  } catch {
    /* already stopped */
  }
}

export function setMusicVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (out && ctx && !muted) out.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}
export function setMusicMuted(m: boolean) {
  muted = m;
  if (out && ctx) out.gain.setTargetAtTime(m ? 0 : volume, ctx.currentTime, 0.05);
}
export const musicState = () => ({ volume, muted });

// ---- Super admin uploads ----------------------------------------------------------------------------
const CHUNK = 700_000; // base64 characters per Firestore document, well under the 1 MB limit

export async function uploadMusic(moment: Moment, file: File, encode: (mono: Float32Array, rate: number) => Promise<Blob>) {
  if (file.size > 60 * 1024 * 1024) throw Error('Choose an audio file smaller than 60 MB.');
  const a = new AudioContext();
  let blob: Blob;
  let duration = 0;
  try {
    const decoded = await a.decodeAudioData(await file.arrayBuffer());
    duration = decoded.duration;
    if (duration < 2) throw Error('Choose a track of at least 2 seconds.');
    if (duration > 5 * 60) throw Error('Choose a track of up to 5 minutes.');
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const ch = decoded.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / decoded.numberOfChannels;
    }
    blob = await encode(mono, decoded.sampleRate);
  } finally {
    await a.close();
  }
  const b64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(Error('We couldn’t read that file. Try another one.'));
    r.readAsDataURL(blob);
  });
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
  await removeMusic(moment);
  // One chunk per write keeps each request small on a slow connection.
  for (let i = 0; i < parts.length; i++) {
    const b = writeBatch(db);
    b.set(doc(db, 'quizMusic', moment, 'chunks', String(i)), { data: parts[i] });
    await b.commit();
  }
  const b = writeBatch(db);
  b.set(doc(db, 'quizMusic', moment), { name: file.name.slice(0, 150), chunks: parts.length, duration: Math.round(duration * 10) / 10, updatedAt: Date.now() });
  await b.commit();
  forgetMusic(moment);
}

export async function removeMusic(moment: Moment) {
  const old = await getDocs(collection(db, 'quizMusic', moment, 'chunks'));
  const b = writeBatch(db);
  old.docs.forEach((d) => b.delete(d.ref));
  b.delete(doc(db, 'quizMusic', moment));
  await b.commit();
  forgetMusic(moment);
}

export async function musicInfo(): Promise<Record<Moment, { name: string; duration: number; updatedAt: number } | null>> {
  const out = {} as Record<Moment, { name: string; duration: number; updatedAt: number } | null>;
  await Promise.all(
    MOMENTS.map(async (m) => {
      const d = (await getDoc(doc(db, 'quizMusic', m.id)).catch(() => null))?.data();
      out[m.id] = d?.chunks ? { name: d.name, duration: d.duration, updatedAt: d.updatedAt } : null;
    }),
  );
  return out;
}

import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Accent } from './phonemes';
import { broadcast, learnerMayPlay } from './liveAudio';

// Recordings of each sound. A teacher's own recording wins in their tasks; otherwise the default
// set, recorded for everyone, plays.

export const OWNER_EMAIL = 'ardanurioglu@gmail.com';
export const isOwner = () => auth.currentUser?.email?.toLowerCase() === OWNER_EMAIL;
const key = (a: Accent, id: string) => `${a}_${id}`;
const cache = new Map<string, string | null>();

async function read(path: string): Promise<string | null> {
  if (cache.has(path)) return cache.get(path)!;
  const s = await getDoc(doc(db, path)).catch(() => null);
  const v = s?.exists() ? String(s.data()?.data ?? '') || null : null;
  cache.set(path, v);
  return v;
}

export const defaultSound = (a: Accent, id: string) => read(`phonemeAudio/${key(a, id)}`);
export const teacherSound = (uid: string, a: Accent, id: string) => read(`teacherSounds/${uid}_${key(a, id)}`);
export async function soundFor(a: Accent, id: string, by?: string) {
  return (by ? await teacherSound(by, a, id) : null) ?? (await defaultSound(a, id));
}

let playing: HTMLAudioElement | null = null;
// Plays the sound; false when there is no recording yet, 'wait' while the teacher plays them.
export async function playSound(a: Accent, id: string, by?: string, fromTeacher = false): Promise<boolean | 'wait'> {
  if (!fromTeacher && !learnerMayPlay()) return 'wait';
  if (!fromTeacher) broadcast({ k: 'phon', accent: a, id, by });
  const src = await soundFor(a, id, by);
  if (!src) return false;
  playing?.pause();
  playing = new Audio(src);
  await playing.play().catch(() => {});
  return true;
}

export async function saveSound(target: 'mine' | 'default', a: Accent, id: string, data: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('signed out');
  const path = target === 'default' ? `phonemeAudio/${key(a, id)}` : `teacherSounds/${uid}_${key(a, id)}`;
  await setDoc(doc(db, path), { data, by: uid, at: Date.now() });
  cache.set(path, data);
}
export async function removeSound(target: 'mine' | 'default', a: Accent, id: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const path = target === 'default' ? `phonemeAudio/${key(a, id)}` : `teacherSounds/${uid}_${key(a, id)}`;
  await deleteDoc(doc(db, path));
  cache.set(path, null);
}

// A sound file or recording as a data address, at most about 650 KB.
export function fileToData(f: Blob): Promise<string> {
  return new Promise((res, rej) => {
    if (f.size > 650_000) return rej(new Error('too big'));
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

// Learners in a live lesson: play the sounds the teacher plays.
if (typeof window !== 'undefined')
  window.addEventListener('ll:live-play', (e) => {
    const v = (e as CustomEvent).detail as { k: string; accent: Accent; id: string; by?: string };
    if (v.k === 'phon') void playSound(v.accent, v.id, v.by, true);
  });

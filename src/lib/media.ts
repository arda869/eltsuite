import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Small audio clips (a word or a sentence) stored as data URLs in Firestore.
// Kept short so each clip stays well under the 1 MB document limit.

// Where media lives: a class ("classes/<id>/media"), or a teacher's own space for things added
// straight to the resources library ("user:<uid>" → "users/<uid>/media").
// A shared copy ("share:<id>") keeps its own media too.
export const mediaCol = (space: string) => (space.startsWith('user:') ? collection(db, 'users', space.slice(5), 'media') : space.startsWith('share:') ? collection(db, 'shares', space.slice(6), 'media') : space.startsWith('chat:') ? collection(db, 'chats', space.slice(5), 'media') : collection(db, 'classes', space, 'media'));
export const mediaDoc = (space: string, id: string) => (space.startsWith('user:') ? doc(db, 'users', space.slice(5), 'media', id) : space.startsWith('share:') ? doc(db, 'shares', space.slice(6), 'media', id) : space.startsWith('chat:') ? doc(db, 'chats', space.slice(5), 'media', id) : doc(db, 'classes', space, 'media', id));

export const MAX_AUDIO_BYTES = 600 * 1024;

export async function saveAudio(classId: string, blob: Blob): Promise<string> {
  if (blob.size > MAX_AUDIO_BYTES) throw new Error('too-big');
  const data = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  const ref = await addDoc(mediaCol(classId), { data, type: blob.type, size: blob.size, createdAt: serverTimestamp() });
  return ref.id;
}

// Pictures for boards, already shrunk by the caller.
export async function saveImage(classId: string, blob: Blob): Promise<string> {
  if (blob.size > MAX_AUDIO_BYTES) throw new Error('too-big');
  return saveAudio(classId, blob);
}

const cache = new Map<string, Promise<string>>();
export function audioUrl(classId: string, id: string) {
  const k = classId + '/' + id;
  if (!cache.has(k)) cache.set(k, getDoc(mediaDoc(classId, id)).then((s) => (s.data()?.data as string) ?? ''));
  return cache.get(k)!;
}

export function speak(text: string, accent: 'RP' | 'GA' = 'RP') {
  try {
    const synth = window.speechSynthesis;
    const lang = accent === 'GA' ? 'en-US' : 'en-GB';
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.9;
    const v = synth.getVoices().find((x) => x.lang === lang) ?? synth.getVoices().find((x) => x.lang.startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    synth.cancel();
    synth.speak(u);
  } catch {
    /* no speech in this browser */
  }
}

export async function playAudio(classId: string, id: string) {
  const url = await audioUrl(classId, id);
  if (url) await new Audio(url).play().catch(() => {});
}

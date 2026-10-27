import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { synth } from './mix';
import { fileToData } from './phonAudio';

// Sound effects in the sound editor. The app owner records the set everyone uses (teachers cannot
// change or delete it); until a recording is there, the effect is made by the app. Teachers add
// their own effects in Settings, for their own projects.

const cache = new Map<string, string | null>();
export async function defaultSfx(k: string): Promise<string | null> {
  if (cache.has(k)) return cache.get(k)!;
  const s = await getDoc(doc(db, 'sfxAudio', k)).catch(() => null);
  const v = s?.exists() ? String(s.data()?.data ?? '') || null : null;
  cache.set(k, v);
  return v;
}
export async function saveDefaultSfx(k: string, f: Blob) {
  const data = await fileToData(f);
  await setDoc(doc(db, 'sfxAudio', k), { data, by: auth.currentUser?.uid ?? '', at: Date.now() });
  cache.set(k, data);
}
export async function removeDefaultSfx(k: string) {
  await deleteDoc(doc(db, 'sfxAudio', k));
  cache.set(k, null);
}

export type MySfx = { id: string; label: string; data: string; dur: number; by: string };
export function useMySfx() {
  const uid = auth.currentUser?.uid;
  const [list, setList] = useState<MySfx[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, 'teacherSfx'), where('by', '==', uid)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MySfx, 'id'>) })).sort((a, b) => a.label.localeCompare(b.label))), () => setList([]));
  }, [uid]);
  return list;
}
export async function addMySfx(label: string, f: Blob) {
  const data = await fileToData(f);
  const dur = await durationOf(data).catch(() => 2);
  await addDoc(collection(db, 'teacherSfx'), { label: label.trim().slice(0, 40) || 'My sound', data, dur, by: auth.currentUser?.uid ?? '', at: Date.now() });
}
export const removeMySfx = (id: string) => deleteDoc(doc(db, 'teacherSfx', id));

async function durationOf(data: string) {
  const b = await decode(data);
  return b.duration;
}
async function decode(data: string): Promise<AudioBuffer> {
  const bytes = await (await fetch(data)).arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const c = new Ctx();
  try {
    return await c.decodeAudioData(bytes);
  } finally {
    void c.close();
  }
}
// A recording as mono samples at the editor's rate.
export async function samplesOf(data: string, rate: number): Promise<Float32Array> {
  const b = await decode(data);
  if (b.sampleRate === rate && b.numberOfChannels === 1) return b.getChannelData(0).slice();
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(b.duration * rate)), rate);
  const s = off.createBufferSource();
  s.buffer = b;
  s.connect(off.destination);
  s.start();
  const r = await off.startRendering();
  return r.getChannelData(0).slice();
}
// The effect's sound: the recorded one when there is one, otherwise made by the app.
export async function sfxSamples(k: string, rate: number, dur: number): Promise<{ data: Float32Array; recorded: boolean }> {
  const rec = k === 'beep' ? null : await defaultSfx(k);
  if (rec) {
    try {
      return { data: await samplesOf(rec, rate), recorded: true };
    } catch {
      /* fall back */
    }
  }
  return { data: synth(k, rate, dur), recorded: false };
}

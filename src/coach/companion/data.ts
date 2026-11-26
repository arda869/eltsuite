import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { emptyProfile, type CoachProfile, type Inquiry, type Reflection } from '../model';

// The Companion's private writing, kept under teachingCoach/{uid} (only the teacher can open it, not
// even their organisation's admins): reflections (the journal), inquiries (small classroom
// experiments), goals, and the profile. Every save checks the version, so two open windows never
// quietly overwrite each other.

export type Mood = 'great' | 'good' | 'mixed' | 'tough' | 'drained';
export const MOODS: { k: Mood; label: string; face: string; colour: string }[] = [
  { k: 'great', label: 'It went really well', face: '◠‿◠', colour: '#5f9a6e' },
  { k: 'good', label: 'Good', face: '◠ ◠', colour: '#8fb36a' },
  { k: 'mixed', label: 'Mixed', face: '– –', colour: '#d6a548' },
  { k: 'tough', label: 'Tough', face: '︶ ︶', colour: '#d07a4f' },
  { k: 'drained', label: 'Drained', face: '— —', colour: '#8d7fa6' },
];
export type Entry = Reflection & { mood?: Mood | ''; tags?: string[]; lessonRef?: { classId: string; itemId: string; title: string; className?: string } | null; words?: number; kind?: 'entry' | 'debrief' };
export type Experiment = Inquiry & { reviewAt?: number | null; status?: 'planning' | 'trying' | 'done' };
export type Goal = { id: string; title: string; why: string; steps: { text: string; done: boolean }[]; status: 'active' | 'done' | 'paused'; at: number; version: number };

export function useCompanion(uid: string) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [experiments, setExperiments] = useState<Experiment[] | null>(null);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const fail = () => setError('We couldn’t open your Companion. Check your connection and try again. Nothing has been lost.');
    const stops = [
      onSnapshot(collection(db, 'teachingCoach', uid, 'reflections'), (s) => setEntries(s.docs.map((d) => ({ ...d.data(), id: d.id }) as Entry).sort((a, b) => b.at - a.at)), fail),
      onSnapshot(collection(db, 'teachingCoach', uid, 'inquiries'), (s) => setExperiments(s.docs.map((d) => ({ ...d.data(), id: d.id }) as Experiment).sort((a, b) => b.at - a.at)), fail),
      onSnapshot(collection(db, 'teachingCoach', uid, 'goals'), (s) => setGoals(s.docs.map((d) => ({ ...d.data(), id: d.id }) as Goal).sort((a, b) => b.at - a.at)), () => setGoals([])),
      onSnapshot(doc(db, 'teachingCoach', uid, 'settings', 'profile'), (s) => setProfile({ ...emptyProfile, ...s.data() } as CoachProfile), fail),
    ];
    return () => stops.forEach((f) => f());
  }, [uid]);
  return { entries, experiments, goals, profile, error };
}

// Save with the version check. Returns the saved version.
export async function saveVersioned<T extends { id: string; version: number }>(uid: string, kind: 'reflections' | 'inquiries' | 'goals', value: T): Promise<number> {
  const ref = doc(db, 'teachingCoach', uid, kind, value.id);
  let next = value.version + 1;
  await runTransaction(db, async (tx) => {
    const old = await tx.get(ref);
    const have = (old.data()?.version as number | undefined) ?? 0;
    if (have !== value.version) throw new Error('changed');
    next = have + 1;
    const clean = Object.fromEntries(Object.entries({ ...value, version: next }).filter(([, v]) => v !== undefined));
    tx.set(ref, clean);
  });
  return next;
}
export const removeDoc = (uid: string, kind: 'reflections' | 'inquiries' | 'goals', id: string) => deleteDoc(doc(db, 'teachingCoach', uid, kind, id));

export const day = (at: number) => new Date(at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
export const shortDay = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const wordsIn = (t: string) => (t.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;

// What keeps coming up: the themes and tags written about most in the last 30 days, and the words
// used most (without the small ones), for “Threads I notice”.
const STOP = new Set('about after again also because been before being could did does doing down each even from going have having here into just like made make more most much need only other over really same some such than that their them then there these they thing think this those through very want were what when where which while will with would your class lesson learners students today just there they them were what'.split(' '));
export function threads(entries: Entry[], days = 30) {
  const since = Date.now() - days * 864e5;
  const recent = entries.filter((e) => e.at >= since);
  const count = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const themes = count(recent.flatMap((e) => [...(e.tags ?? []), ...(e.theme && e.theme !== 'Open reflection' ? [e.theme] : [])])).filter(([, n]) => n > 1);
  const words = count(recent.flatMap((e) => (e.text.toLowerCase().match(/[\p{L}]{5,}/gu) ?? []).filter((w) => !STOP.has(w)))).filter(([, n]) => n > 2).slice(0, 6);
  const moods = recent.map((e) => e.mood).filter(Boolean) as Mood[];
  return { recent: recent.length, themes, words, moods };
}

// Days in a row with something written (today or yesterday counts as keeping it going).
export function streak(entries: Entry[]) {
  const days = new Set(entries.map((e) => new Date(e.at).toDateString()));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

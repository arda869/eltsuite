import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';

// The languages learners speak. Teachers mark them for each learner; the class keeps the set, so
// dictionary entries offer a translation in each, and each learner sees their own languages.

export const LANGUAGES = [
  'Arabic', 'Bengali', 'Cantonese', 'Catalan', 'Czech', 'Danish', 'Dutch', 'Farsi', 'Finnish', 'French', 'German', 'Greek', 'Hebrew', 'Hindi', 'Hungarian', 'Indonesian', 'Italian', 'Japanese', 'Kazakh', 'Korean', 'Kurdish', 'Malay', 'Mandarin', 'Norwegian', 'Polish', 'Portuguese', 'Punjabi', 'Romanian', 'Russian', 'Serbian', 'Slovak', 'Spanish', 'Swahili', 'Swedish', 'Tagalog', 'Tamil', 'Thai', 'Turkish', 'Ukrainian', 'Urdu', 'Uzbek', 'Vietnamese',
];

export function useClassLangs(classId?: string) {
  const [langs, setLangs] = useState<string[]>([]);
  useEffect(() => {
    if (!classId) return setLangs([]);
    return onSnapshot(
      doc(db, 'classes', classId),
      (s) => setLangs(((s.data()?.langs ?? []) as string[]).slice().sort()),
      () => setLangs([]),
    );
  }, [classId]);
  return langs;
}

// A learner's own languages; null for teachers, who see every translation.
const mineCache: Record<string, string[]> = {};
export function useMyLangs(): string[] | null {
  const { profile } = useAuth();
  const key = profile?.role === 'learner' ? `${profile.classId}/${profile.learnerId}` : '';
  const [langs, setLangs] = useState<string[] | null>(key ? mineCache[key] ?? [] : null);
  useEffect(() => {
    if (!key || profile?.role !== 'learner') return setLangs(null);
    if (mineCache[key]) return setLangs(mineCache[key]);
    getDoc(doc(db, 'classes', profile.classId, 'learners', profile.learnerId))
      .then((s) => {
        mineCache[key] = (s.data()?.langs ?? []) as string[];
        setLangs(mineCache[key]);
      })
      .catch(() => setLangs([]));
  }, [key, profile]);
  return langs;
}

// Save one learner's languages, and the class's set from everyone's.
export async function saveLearnerLangs(classId: string, learnerId: string, langs: string[], others: { id: string; langs?: string[] }[]) {
  await updateDoc(doc(db, 'classes', classId, 'learners', learnerId), { langs });
  const all = new Set<string>(langs);
  for (const o of others) if (o.id !== learnerId) (o.langs ?? []).forEach((l) => all.add(l));
  await updateDoc(doc(db, 'classes', classId), { langs: [...all].sort() });
}

// The translations to show: the learner's own languages, or all of them for a teacher.
export function translationsFor(d: { trans?: Record<string, string>; translation?: string; lang?: string }, mine: string[] | null): [string, string][] {
  const out = Object.entries(d.trans ?? {}).filter(([l, v]) => v?.trim() && (!mine || mine.includes(l)));
  if (d.translation?.trim() && !(d.lang && d.trans?.[d.lang]) && (!mine || !d.lang || mine.includes(d.lang))) out.unshift([d.lang || 'Translation', d.translation]);
  return out;
}

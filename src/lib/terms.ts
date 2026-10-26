import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

// What a class calls its people: learners, students, pupils, trainees… and teacher, trainer,
// tutor… The teacher chooses in class settings; the app's words follow in that class.

export type Terms = { learner: string; learners: string; teacher: string; teachers: string };
export const LEARNER_WORDS: [string, string][] = [
  ['learner', 'learners'],
  ['student', 'students'],
  ['pupil', 'pupils'],
  ['trainee', 'trainees'],
  ['participant', 'participants'],
  ['teacher', 'teachers'],
];
export const TEACHER_WORDS: [string, string][] = [
  ['teacher', 'teachers'],
  ['trainer', 'trainers'],
  ['tutor', 'tutors'],
  ['instructor', 'instructors'],
  ['coach', 'coaches'],
];
export const defaultTerms = (kind?: string): Terms => (kind === 'training' ? { learner: 'trainee', learners: 'trainees', teacher: 'trainer', teachers: 'trainers' } : { learner: 'learner', learners: 'learners', teacher: 'teacher', teachers: 'teachers' });
export const termsOf = (c?: { kind?: string; terms?: Partial<Terms> } | null): Terms => ({ ...defaultTerms(c?.kind), ...Object.fromEntries(Object.entries(c?.terms ?? {}).filter(([, v]) => typeof v === 'string' && v.trim())) });

const cache: Record<string, Terms> = {};
export function useTerms(classId?: string): Terms {
  const [t, setT] = useState<Terms>(() => (classId && cache[classId]) || defaultTerms());
  useEffect(() => {
    if (!classId || classId.includes(':')) return;
    return onSnapshot(
      doc(db, 'classes', classId),
      (s) => {
        cache[classId] = termsOf(s.data() as { kind?: string; terms?: Partial<Terms> });
        setT(cache[classId]);
      },
      () => {},
    );
  }, [classId]);
  return t;
}

// Rewrites the app's words for this class: "Your teacher can see your answers" → "Your tutor…".
export function rewrite(t: Terms, s: string): string {
  const map: Record<string, string> = { learner: t.learner, learners: t.learners, teacher: t.teacher, teachers: t.teachers };
  if (t.learner === 'learner' && t.teacher === 'teacher') return s;
  // One pass, so the two can even swap (learners called teachers).
  return s.replace(/\b(learners|learner|teachers|teacher)(?=\b|’|')/gi, (m) => {
    const w = map[m.toLowerCase()] ?? m;
    return m[0] === m[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w;
  });
}
export function useT(classId?: string) {
  const t = useTerms(classId);
  return (s: string) => rewrite(t, s);
}

// The class on screen: pages that show one class set it, and every tr() call follows.
let current: Terms = defaultTerms();
export const tr = (s: string) => rewrite(current, s);
export function useClassTerms(classId?: string): Terms {
  const t = useTerms(classId);
  current = classId ? t : defaultTerms();
  return t;
}

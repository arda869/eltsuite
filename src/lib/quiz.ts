import { useEffect, useState } from 'react';
import { onValue, ref, remove, set, update } from 'firebase/database';
import type { JSONContent } from '@tiptap/react';
import { rtdb } from './firebase';
import { isAnswered, questionIds, scoreQuestion, type AnswerKey, type Response } from './questions';

// Team quiz: a task's auto-marked questions as a live team race. The state lives in the
// Realtime Database (sessions/{class}/quiz); only the teacher writes it, learners write their
// own answers under quiz/answers/{uid}.

export type Team = { name: string; color: string; members: string[] };
export type QuizState = {
  itemId: string;
  taskId: string;
  title: string;
  qids: string[];
  teams: Record<string, Team>;
  seconds: number;
  i: number;
  phase: 'lobby' | 'question' | 'reveal' | 'podium';
  startedAt: number;
  scores?: Record<string, number>;
  gained?: Record<string, number>;
  results?: Record<string, { ok: boolean; pts: number }>; // per uid, for the question just revealed
  answers?: Record<string, Record<string, { v: Response; t: number; learnerId: string }>>;
};

// No red or green for teams: those mean right and wrong.
export const TEAM_COLORS = ['#d98f63', '#2f5fa8', '#7a4a86', '#d9a13a', '#5b6b7a', '#2f2e2d'];
export const TEAM_NAMES = ['Orange', 'Blue', 'Purple', 'Gold', 'Slate', 'Ink'];

const path = (classId: string) => `sessions/${classId}/quiz`;
export function useQuiz(classId: string) {
  const [q, setQ] = useState<QuizState | null>(null);
  useEffect(() => {
    if (!classId) return;
    return onValue(ref(rtdb, path(classId)), (s) => setQ(s.val()), () => setQ(null));
  }, [classId]);
  return q;
}
export const startQuiz = (classId: string, q: QuizState) => set(ref(rtdb, path(classId)), q);
export const patchQuiz = (classId: string, p: Partial<QuizState> | Record<string, unknown>) => update(ref(rtdb, path(classId)), p);
export const endQuiz = (classId: string) => remove(ref(rtdb, path(classId)));
export const sendQuizAnswer = (classId: string, uid: string, qid: string, v: Response, learnerId: string) => set(ref(rtdb, `${path(classId)}/answers/${uid}/${qid}`), { v: v ?? null, t: Date.now(), learnerId });

// Questions that work in a race: everything auto-marked, not long answers, reflections or cards.
export function quizQuestions(content: JSONContent | null) {
  const inCards = new Set<string>();
  const walk = (n: JSONContent, cards: boolean) => {
    if (cards && n.attrs?.id) inCards.add(n.attrs.id);
    n.content?.forEach((c) => walk(c, cards || n.type === 'randomPick'));
  };
  if (content) walk(content, false);
  return questionIds(content).filter((q) => !['writing', 'reflect'].includes(q.type) && !inCards.has(q.id));
}

// The top-level block that holds a question, shown on its own.
export function blockFor(content: JSONContent | null, qid: string): JSONContent {
  const has = (n: JSONContent): boolean => n.attrs?.id === qid || !!n.content?.some(has);
  const top = (content?.content ?? []).find(has);
  return { type: 'doc', content: top ? [top] : [] };
}

export function teamOf(q: QuizState | null, learnerId: string) {
  return Object.entries(q?.teams ?? {}).find(([, t]) => (t.members ?? []).includes(learnerId));
}

// Scores the current question: faster right answers earn more (500 to 1000 points). A team gets
// the average of its members' points, so small and big teams are equal.
export function scoreRound(q: QuizState, key: AnswerKey) {
  const qid = q.qids[q.i];
  const results: Record<string, { ok: boolean; pts: number }> = {};
  const gained: Record<string, number> = {};
  for (const [tid, t] of Object.entries(q.teams)) {
    let sum = 0;
    for (const [uid, a] of Object.entries(q.answers ?? {})) {
      const ans = a[qid];
      if (!ans || !(t.members ?? []).includes(ans.learnerId)) continue;
      const s = scoreQuestion(key[qid], ans.v);
      const ok = isAnswered(ans.v) && s.max > 0 && s.got === s.max;
      const part = s.max > 0 ? s.got / s.max : 0;
      const speed = Math.max(0, Math.min(1, 1 - (ans.t - q.startedAt) / (q.seconds * 1000)));
      const pts = Math.round(part * (500 + 500 * speed));
      results[uid] = { ok, pts };
      sum += pts;
    }
    gained[tid] = Math.round(sum / Math.max(1, (t.members ?? []).length));
  }
  const scores = { ...(q.scores ?? {}) };
  for (const tid of Object.keys(q.teams)) scores[tid] = (scores[tid] ?? 0) + (gained[tid] ?? 0);
  return { results, gained, scores };
}

// Random teams of roughly equal size.
export function makeTeams(learnerIds: string[], n: number): Record<string, Team> {
  const ids = [...learnerIds].sort(() => Math.random() - 0.5);
  const out: Record<string, Team> = {};
  for (let i = 0; i < n; i++) out['t' + i] = { name: TEAM_NAMES[i % TEAM_NAMES.length], color: TEAM_COLORS[i % TEAM_COLORS.length], members: [] };
  ids.forEach((id, i) => out['t' + (i % n)].members.push(id));
  return out;
}

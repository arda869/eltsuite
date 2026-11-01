import type { AnswerKey } from './questions';
import { doc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { noteFeature } from '../discovery/store';

// Where the teacher is in a lesson. One document per class.
export type LiveState = {
  teaching: boolean;
  itemId: string;
  taskId: string;
  teacherName: string;
  teacherUid?: string; // which teacher is presenting (co-teachers)
  sync?: boolean; showMarker?: boolean; // learners follow the teacher's task
  revealed?: Record<string, number>; // taskId -> how many answers are revealed (-1 = all)
  revealedQs?: Record<string, string[]>; // taskId -> single questions the teacher revealed
  timer?: { endsAt: number; total: number; up?: boolean; startedAt?: number } | null; // countdown (or count-up stopwatch) everyone sees
  picked?: { name: string; learnerId: string; at: number } | null; // random learner picker
  spotlight?: { taskId: string; qid: string; text: string; at: number } | null; // one answer shown to the class, name hidden
  groupSetId?: string | null; // the group set in use (breakout rooms)
  syncRoom?: string | null; // when set, "Sync" moves only this room with the teacher
  roomTask?: Record<string, string> | null; // room -> task the room is synced to
  poll?: { id: string; q: import('./survey').SurveyQ; anonymous: boolean; open: boolean; at: number } | null; // a quick live poll
  quiz?: boolean | null; // a team quiz is running (details in the Realtime Database)
  board?: { open: boolean; page: string } | null; // the lesson board, and the page the teacher is on
  video?: boolean | null; // the teacher is in the class video room: learners are asked to join
  videoRooms?: Record<string, { url: string; name: string }> | null; // breakout video rooms, by group of the group set in use
  startedAt?: Timestamp;
  updatedAt?: Timestamp;
};

export const liveRef = (classId: string) => doc(db, 'classes', classId, 'live', 'state');

export async function setLive(classId: string, patch: Partial<LiveState>) {
  await setDoc(liveRef(classId), { ...patch, ...(patch.teaching === true && patch.itemId ? { startedAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() }, { merge: true });
  if (patch.teaching === true && patch.itemId) noteFeature('live', classId + ':' + patch.itemId);
}

// A lesson counts as live only while the teacher's teaching screen is open: it checks in every
// minute, and a lesson with no check-in for 10 minutes (screen closed, laptop asleep) has ended.
export const LIVE_BEAT = 60 * 1000;
export function isLive(s: LiveState | null | undefined) {
  if (!s?.teaching) return false;
  const t = s.updatedAt?.toMillis?.() ?? Date.now();
  return Date.now() - t < 10 * 60 * 1000;
}

export const isSynced = (s: LiveState | null | undefined, itemId: string) => isLive(s) && s!.itemId === itemId && !!s!.sync;
export const revealedCount = (s: LiveState | null | undefined, itemId: string, taskId: string) =>
  isLive(s) && s!.itemId === itemId ? s!.revealed?.[taskId] ?? 0 : 0;

// The part of the answer key the teacher has revealed: the first n questions, or all (-1).
export function revealedSubset(key: AnswerKey, qs: { id: string }[], n: number, extra: string[] = []): AnswerKey {
  const all = qs.map((q) => q.id).filter((id) => key[id] && key[id].kind !== 'writing');
  const ids = [...(n < 0 ? all : all.slice(0, n)), ...extra.filter((id) => all.includes(id))];
  return Object.fromEntries(ids.filter((id) => key[id]).map((id) => [id, key[id]]));
}

export const revealedSingles = (s: LiveState | null | undefined, itemId: string, taskId: string) => (isLive(s) && s!.itemId === itemId ? s!.revealedQs?.[taskId] ?? [] : []);

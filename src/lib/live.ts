import { doc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// Where the teacher is in a lesson. One document per class.
export type LiveState = {
  teaching: boolean;
  itemId: string;
  taskId: string;
  teacherName: string;
  sync?: boolean; showMarker?: boolean; // learners follow the teacher's task
  revealed?: Record<string, number>; // taskId -> how many answers are revealed (-1 = all)
  startedAt?: Timestamp;
  updatedAt?: Timestamp;
};

export const liveRef = (classId: string) => doc(db, 'classes', classId, 'live', 'state');

export async function setLive(classId: string, patch: Partial<LiveState>) {
  await setDoc(liveRef(classId), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

// A lesson counts as live only if the teacher has been active in the last 3 hours.
export function isLive(s: LiveState | null | undefined) {
  if (!s?.teaching) return false;
  const t = s.updatedAt?.toMillis?.() ?? Date.now();
  return Date.now() - t < 3 * 60 * 60 * 1000;
}

export const isSynced = (s: LiveState | null | undefined, itemId: string) => isLive(s) && s!.itemId === itemId && !!s!.sync;
export const revealedCount = (s: LiveState | null | undefined, itemId: string, taskId: string) =>
  isLive(s) && s!.itemId === itemId ? s!.revealed?.[taskId] ?? 0 : 0;

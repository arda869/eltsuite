import { doc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// Where the teacher is in a lesson. One document per class.
export type LiveState = {
  teaching: boolean;
  itemId: string;
  taskId: string;
  teacherName: string;
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

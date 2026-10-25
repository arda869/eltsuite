import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// A "draw a card" activity played together: one shared pile for the whole class.
export type SharedPick = { taskId: string; pickId: string; h: number[]; b: number[]; seq: number; by: string; at?: Timestamp };

export const pickRef = (classId: string, taskId: string, pickId: string) => doc(db, 'classes', classId, 'picks', `${taskId}_${pickId}`);

export function useSharedPicks(classId: string, taskId: string) {
  const [picks, setPicks] = useState<Record<string, SharedPick>>({});
  useEffect(() => {
    setPicks({});
    if (!classId || !taskId) return;
    return onSnapshot(
      query(collection(db, 'classes', classId, 'picks'), where('taskId', '==', taskId)),
      (s) => setPicks(Object.fromEntries(s.docs.map((d) => [(d.data() as SharedPick).pickId, d.data() as SharedPick]))),
      () => {},
    );
  }, [classId, taskId]);
  return picks;
}

export async function drawShared(classId: string, taskId: string, pickId: string, h: number[], b: number[], seq: number, by: string) {
  await setDoc(pickRef(classId, taskId, pickId), { taskId, pickId, h, b, seq, by, at: serverTimestamp() });
}

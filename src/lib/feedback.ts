import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';

// Peer feedback a learner has chosen (or been asked) to send to a classmate.
export type SentFeedback = {
  taskId: string;
  blockId: string;
  from: string; // giver learnerId
  fromName: string;
  fromUid: string;
  to: string; // receiver learnerId
  ratings: Record<string, number | number[] | string>;
};

export const feedbackRef = (classId: string, taskId: string, blockId: string, from: string) => doc(db, 'classes', classId, 'feedback', `${taskId}_${blockId}_${from}`);

export async function sendFeedback(classId: string, f: SentFeedback) {
  await setDoc(feedbackRef(classId, f.taskId, f.blockId, f.from), { ...f, at: serverTimestamp() });
}

export function useReceivedFeedback(classId: string, taskId: string, learnerId: string) {
  const [list, setList] = useState<SentFeedback[]>([]);
  useEffect(() => {
    setList([]);
    if (!classId || !taskId || !learnerId) return;
    return onSnapshot(
      query(collection(db, 'classes', classId, 'feedback'), where('to', '==', learnerId), where('taskId', '==', taskId)),
      (s) => setList(s.docs.map((d) => d.data() as SentFeedback)),
      () => {},
    );
  }, [classId, taskId, learnerId]);
  return list;
}

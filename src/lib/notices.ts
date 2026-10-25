import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, onSnapshot, query, serverTimestamp, where, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// "You were tagged" notifications. `to` is a learnerId, or 'teacher'.
export type Notice = { id: string; to: string; fromName: string; fromUid: string; what: string; text: string; itemId: string; taskId: string; at?: Timestamp };

export async function notify(classId: string, n: Omit<Notice, 'id' | 'at'>) {
  await addDoc(collection(db, 'classes', classId, 'notices'), { ...n, at: serverTimestamp() });
}

// New notices that arrive while this page is open.
export function useNewNotices(classId: string, to: string) {
  const [list, setList] = useState<Notice[]>([]);
  const since = useRef(Date.now());
  useEffect(() => {
    if (!classId || !to) return;
    return onSnapshot(
      query(collection(db, 'classes', classId, 'notices'), where('to', '==', to)),
      (s) => {
        const fresh = s.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Notice, 'id'>) }))
          .filter((n) => (n.at?.toMillis?.() ?? Date.now()) >= since.current - 2000);
        setList(fresh.sort((a, b) => (a.at?.toMillis?.() ?? 0) - (b.at?.toMillis?.() ?? 0)));
      },
      () => {},
    );
  }, [classId, to]);
  return list;
}

// Names written as @First Last in a message, matched against the class list.
export type Person = { id: string; name: string };
export function findMentions(text: string, people: Person[]) {
  const lower = text.toLowerCase();
  return people.filter((p) => lower.includes('@' + p.name.toLowerCase()));
}

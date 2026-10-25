import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export type Presence = { id: string; name: string; learnerId: string; itemId: string; taskId: string; at?: Timestamp };

// Learners send a heartbeat every 30 seconds while the app is open.
export function usePresenceBeat(classId: string, uid: string | undefined, info: { name: string; learnerId: string; itemId: string; taskId: string }) {
  const { name, learnerId, itemId, taskId } = info;
  useEffect(() => {
    if (!classId || !uid) return;
    const ref = doc(db, 'classes', classId, 'presence', uid);
    const beat = () => {
      if (document.visibilityState === 'hidden') return;
      setDoc(ref, { name, learnerId, itemId, taskId, at: serverTimestamp() }).catch(() => {});
    };
    beat();
    const t = window.setInterval(beat, 30000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [classId, uid, name, learnerId, itemId, taskId]);
}

export const isOnline = (p: Presence) => Date.now() - (p.at?.toMillis?.() ?? Date.now()) < 75000;

export function usePresence(classId: string, enabled = true) {
  const [list, setList] = useState<Presence[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!classId || !enabled) return;
    const u = onSnapshot(collection(db, 'classes', classId, 'presence'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Presence, 'id'>) }))), () => {});
    const t = window.setInterval(() => tick((x) => x + 1), 20000);
    return () => (u(), window.clearInterval(t));
  }, [classId, enabled]);
  return list;
}

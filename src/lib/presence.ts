import { useEffect, useState } from 'react';
import { collection, doc, increment, onSnapshot, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { useRef } from 'react';
import { db } from './firebase';

export type Presence = { id: string; name: string; learnerId: string; itemId: string; taskId: string; avatar?: string; at?: Timestamp };

// Learners send a heartbeat every 30 seconds while the app is open.
export function usePresenceBeat(classId: string, uid: string | undefined, info: { name: string; learnerId: string; itemId: string; taskId: string; avatar?: string; live?: boolean }) {
  const { name, learnerId, itemId, taskId, avatar = '', live = false } = info;
  const lastFirst = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!classId || !uid) return;
    const ref = doc(db, 'classes', classId, 'presence', uid);
    const beat = () => {
      if (document.visibilityState === 'hidden') return;
      setDoc(ref, { name, learnerId, itemId, taskId, avatar, at: serverTimestamp() }).catch(() => {});
      // Attendance: while in a lesson, add the half minute since the last beat.
      if (itemId && learnerId && live) setDoc(doc(db, 'classes', classId, 'attendance', `${itemId}_${uid}`), { itemId, learnerId, uid, name, day: new Date().toISOString().slice(0, 10), firstAt: lastFirst.current[itemId] ?? Date.now(), lastAt: Date.now(), minutes: increment(0.5) }, { merge: true }).catch(() => {});
      if (itemId && !lastFirst.current[itemId]) lastFirst.current[itemId] = Date.now();
    };
    beat();
    const t = window.setInterval(beat, 30000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [classId, uid, name, learnerId, itemId, taskId, avatar, live]);
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

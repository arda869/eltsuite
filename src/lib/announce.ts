import { useEffect, useState } from 'react';
import { addDoc, collection, deleteField, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// Short announcements from the teacher. `to` is 'all' or a list of learnerIds.
export type Announcement = { id: string; text: string; link?: string; to: 'all' | string[]; chime: boolean; at?: Timestamp; remindAt?: number; acks?: Record<string, number> };

const col = (classId: string) => collection(db, 'classes', classId, 'announcements');

export function postAnnouncement(classId: string, a: Omit<Announcement, 'id' | 'at' | 'acks'>) {
  return addDoc(col(classId), { ...a, acks: {}, at: serverTimestamp() });
}
export function acknowledge(classId: string, id: string, learnerId: string) {
  return updateDoc(doc(col(classId), id), { [`acks.${learnerId}`]: Date.now() });
}
export function remind(classId: string, id: string) {
  return updateDoc(doc(col(classId), id), { remindAt: Date.now() });
}
export function retract(classId: string, id: string) {
  return updateDoc(doc(col(classId), id), { to: [], remindAt: deleteField() });
}

export function useAnnouncements(classId: string) {
  const [list, setList] = useState<Announcement[]>([]);
  useEffect(() => {
    if (!classId) return;
    return onSnapshot(query(col(classId), orderBy('at', 'desc')), (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) }))), () => {});
  }, [classId]);
  return list;
}

// A soft two-note chime made in the browser (no sound file needed).
export function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.65);
    });
    window.setTimeout(() => ctx.close(), 1500);
  } catch {
    /* sound not available */
  }
}

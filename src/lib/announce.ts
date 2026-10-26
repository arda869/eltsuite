import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, type Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// Short announcements from the teacher. `to` is 'all' or a list of learnerIds.
// sendAt: when learners may see it (a scheduled announcement has a sendAt in the future).
// pinned: stays at the top of the class home screen until unpinned.
export type AnnounceEmail = { subject: string; content: unknown; byUid: string; byName: string };
export type Announcement = { id: string; email?: AnnounceEmail; text: string; link?: string; to: 'all' | string[]; chime: boolean; at?: Timestamp; sendAt: number; pinned?: boolean; remindAt?: number; acks?: Record<string, number>; byName?: string };

const col = (classId: string) => collection(db, 'classes', classId, 'announcements');

export async function postAnnouncement(classId: string, a: Omit<Announcement, 'id' | 'at' | 'acks' | 'sendAt'> & { sendAt?: number }) {
  const clean = JSON.parse(JSON.stringify(a));
  const r = await addDoc(col(classId), { ...clean, sendAt: a.sendAt ?? Date.now(), acks: {}, at: serverTimestamp() });
  // Sent by email too: the mail job (scripts/mail.mjs) picks it up from the outbox.
  if (a.email) await addDoc(collection(db, 'outbox'), { kind: 'announce', classId, annId: r.id, sendAt: a.sendAt ?? Date.now(), state: 'waiting', at: Date.now() });
  return r;
}
export const pinAnnouncement = (classId: string, id: string, pinned: boolean) => updateDoc(doc(col(classId), id), { pinned });
export const cancelScheduled = (classId: string, id: string) => deleteDoc(doc(col(classId), id));
export const SKEW = 60000; // learners ask for announcements due up to a minute ago, so clock differences never block the query
export function acknowledge(classId: string, id: string, learnerId: string) {
  return updateDoc(doc(col(classId), id), { [`acks.${learnerId}`]: Date.now() });
}
export function remind(classId: string, id: string) {
  return updateDoc(doc(col(classId), id), { remindAt: Date.now() });
}
export function retract(classId: string, id: string) {
  return updateDoc(doc(col(classId), id), { to: [], remindAt: deleteField() });
}

// Teachers see everything (including scheduled ones). Learners only what is due; the query is renewed every minute.
export function useAnnouncements(classId: string, learner = false) {
  const [list, setList] = useState<Announcement[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!learner) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 60000);
    return () => window.clearInterval(t);
  }, [learner]);
  useEffect(() => {
    if (!classId) return;
    const q = learner ? query(col(classId), where('sendAt', '<=', Date.now() - SKEW), orderBy('sendAt', 'desc')) : query(col(classId), orderBy('sendAt', 'desc'));
    return onSnapshot(q, (s) => setList(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) }))), () => {});
  }, [classId, learner, tick]);
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

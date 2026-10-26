import { useEffect, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, rtdb } from './firebase';

// How sounds and videos play while a lesson is live, set for each class:
//  self:     each learner plays them on their own device;
//  together: the teacher plays, and the sound plays on every learner's device at the same time;
//  teacher:  the teacher plays, and only the teacher's device makes a sound (in the classroom).
export type LiveAudioMode = 'self' | 'together' | 'teacher';
export const LIVE_AUDIO: { k: LiveAudioMode; label: string; about: string }[] = [
  { k: 'self', label: 'Each learner plays them', about: 'Learners press play on their own devices, at their own pace. Good for headphones and self-study during the lesson.' },
  { k: 'together', label: 'I play, every device plays', about: 'When you press play, the sound plays on every learner’s device at the same moment. Good for online lessons.' },
  { k: 'teacher', label: 'I play, only my device plays', about: 'Only your device makes a sound, for the classroom speakers. Learners’ play buttons wait for you.' },
];

type Ctx = { classId: string; mode: LiveAudioMode; live: boolean; teacher: boolean };
let ctx: Ctx = { classId: '', mode: 'self', live: false, teacher: false };
const subs = new Set<() => void>();
export type LivePlay = { k: 'phon'; accent: string; id: string; by?: string; at: number } | { k: 'media'; media: string; t: number; playing: boolean; at: number };

// Learners: false while the teacher plays the sounds.
export const learnerMayPlay = () => !(ctx.live && !ctx.teacher && ctx.mode !== 'self');
// The teacher: send what they play to every device.
export function broadcast(p: Omit<LivePlay, 'at'> & Record<string, unknown>) {
  if (!(ctx.live && ctx.teacher && ctx.mode === 'together' && ctx.classId)) return;
  void set(ref(rtdb, `sessions/${ctx.classId}/play`), { ...p, at: Date.now() }).catch(() => {});
}

// Pages showing a lesson tell this module whether it is live, and who is looking.
export function useLiveAudioSetup(classId: string, live: boolean, teacher: boolean) {
  const [mode, setMode] = useState<LiveAudioMode>('self');
  useEffect(() => {
    if (!classId) return;
    return onSnapshot(doc(db, 'classes', classId), (s) => setMode((s.data()?.liveAudio as LiveAudioMode) ?? 'self'), () => {});
  }, [classId]);
  useEffect(() => {
    ctx = { classId, mode, live, teacher };
    subs.forEach((f) => f());
    return () => {
      ctx = { classId: '', mode: 'self', live: false, teacher: false };
      subs.forEach((f) => f());
    };
  }, [classId, mode, live, teacher]);
  // Learners in "together" mode: play what the teacher plays.
  useEffect(() => {
    if (!classId || !live || teacher || mode !== 'together') return;
    const since = Date.now() - 1500;
    return onValue(ref(rtdb, `sessions/${classId}/play`), (s) => {
      const v = s.val() as LivePlay | null;
      if (!v || v.at < since) return;
      window.dispatchEvent(new CustomEvent('ll:live-play', { detail: v }));
    });
  }, [classId, live, teacher, mode]);
}

// Re-render when the live audio situation changes.
export function useLiveAudio() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);
  return { mayPlay: learnerMayPlay(), mode: ctx.mode, live: ctx.live, teacher: ctx.teacher };
}

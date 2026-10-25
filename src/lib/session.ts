import { useEffect, useRef, useState } from 'react';
import { onDisconnect, onValue, ref, remove, serverTimestamp, set, update } from 'firebase/database';
import { rtdb } from './firebase';

// Quick, short-lived live signals go through the Realtime Database:
// the teacher's pointer, hand raises, "I'm stuck" and reactions.

// The teacher claims the class once so the database rules know who may move the pointer.
export async function claimClass(classId: string, uid: string) {
  await set(ref(rtdb, `classOwners/${classId}`), uid).catch(() => {});
}

export type Pointer = { taskId: string; bk: string; x: number; y: number; t: number; on: boolean };

export function sendPointer(classId: string, p: Omit<Pointer, 't'>) {
  return set(ref(rtdb, `sessions/${classId}/pointer`), { ...p, t: Date.now() }).catch(() => {});
}

export function usePointer(classId: string) {
  const [p, setP] = useState<Pointer | null>(null);
  useEffect(() => {
    if (!classId) return;
    return onValue(ref(rtdb, `sessions/${classId}/pointer`), (s) => setP(s.val()), () => {});
  }, [classId]);
  return p;
}

export type Reaction = 'thumbsup' | 'heart' | 'laugh' | 'wow' | 'clap';
export type Signal = { name: string; learnerId: string; hand?: boolean; stuck?: boolean; reaction?: Reaction | null; reactionAt?: number; handAt?: number };

export function setSignal(classId: string, uid: string, patch: Partial<Signal>) {
  const r = ref(rtdb, `sessions/${classId}/signals/${uid}`);
  onDisconnect(r).update({ hand: false, stuck: false }).catch(() => {});
  return update(r, { ...patch, at: serverTimestamp() }).catch(() => {});
}
export const clearSignal = (classId: string, uid: string) => update(ref(rtdb, `sessions/${classId}/signals/${uid}`), { hand: false, stuck: false }).catch(() => {});
export const clearAllHands = (classId: string, uids: string[]) => Promise.all(uids.map((u) => clearSignal(classId, u)));

export function useSignals(classId: string) {
  const [list, setList] = useState<Record<string, Signal>>({});
  useEffect(() => {
    if (!classId) return;
    return onValue(ref(rtdb, `sessions/${classId}/signals`), (s) => setList(s.val() ?? {}), () => {});
  }, [classId]);
  return list;
}

export function useMySignal(classId: string, uid?: string) {
  const [s, setS] = useState<Signal | null>(null);
  useEffect(() => {
    if (!classId || !uid) return;
    return onValue(ref(rtdb, `sessions/${classId}/signals/${uid}`), (x) => setS(x.val()), () => {});
  }, [classId, uid]);
  return s;
}

// Throttle helper for the pointer (about 15 updates a second).
export function useThrottle<T extends (...a: never[]) => void>(fn: T, ms = 66) {
  const last = useRef(0);
  const timer = useRef<number>();
  return (...a: Parameters<T>) => {
    const now = Date.now();
    window.clearTimeout(timer.current);
    if (now - last.current >= ms) {
      last.current = now;
      fn(...a);
    } else timer.current = window.setTimeout(() => ((last.current = Date.now()), fn(...a)), ms - (now - last.current));
  };
}

export const removeSignal = (classId: string, uid: string) => remove(ref(rtdb, `sessions/${classId}/signals/${uid}`)).catch(() => {});

import { useCallback, useRef, useState } from 'react';
import { deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { clean, elsCol, type El } from './model';

// Saving changes, with undo and redo of your own changes. While something is being dragged or a
// slider moved, the change shows straight away ("live") and is saved when it stops.

type Snap = Record<string, El | null>;
type Step = { before: Snap; after: Snap; at: number; key?: string };
function readRecovery(designId: string): Snap {
  try { const data = JSON.parse(localStorage.getItem(`elt.designElementsDraft:${designId}`) || '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; }
  catch { return {}; }
}

export function useEdits(designId: string, els: El[]) {
  const [live, setLiveState] = useState<Record<string, Partial<El>>>({});
  const liveRef = useRef(live);
  liveRef.current = live;
  const elsRef = useRef(els);
  elsRef.current = els;
  const undo = useRef<Step[]>([]);
  const redo = useRef<Step[]>([]);
  const [, tick] = useState(0);
  const timer = useRef<number>(0);
  const [pending, setPending] = useState(0);
  const [recovery, setRecovery] = useState<Snap>(() => readRecovery(designId));
  const [failed, setFailed] = useState(() => Object.keys(readRecovery(designId)).length > 0);
  const recoveryRef = useRef(recovery);
  recoveryRef.current = recovery;
  const tail = useRef<Promise<void>>(Promise.resolve());
  const persist = (snap: Snap) => {
    try { if (Object.keys(snap).length) localStorage.setItem(`elt.designElementsDraft:${designId}`, JSON.stringify(snap)); else localStorage.removeItem(`elt.designElementsDraft:${designId}`); }
    catch { /* The in-memory recovery still remains. */ }
  };
  const track = (snap: Snap) => {
    const queued = { ...recoveryRef.current, ...snap };
    recoveryRef.current = queued;
    setRecovery(queued);
    persist(queued);
    setPending((n) => n + 1);
    const write = tail.current.then(() => writeSnap(snap));
    tail.current = write.catch(() => {});
    write.then(() => {
      const next = { ...recoveryRef.current };
      Object.keys(snap).forEach(id => { if (next[id] === snap[id]) delete next[id]; });
      recoveryRef.current = next;
      setRecovery(next);
      persist(next);
      setFailed(previous => previous && Object.keys(next).length > 0);
    }, () => {
      setFailed(true);
    }).finally(() => setPending((n) => n - 1));
    return write;
  };

  const byId = () => {
    const map = new Map(elsRef.current.map((e) => [e.id, e]));
    for (const [id, value] of Object.entries(recoveryRef.current)) {
      if (value) map.set(id, value);
      else map.delete(id);
    }
    return map;
  };

  const writeSnap = useCallback(
    async (s: Snap) => {
      const ids = Object.keys(s);
      if (ids.length === 1) {
        const v = s[ids[0]];
        if (v) await setDoc(doc(elsCol(designId), v.id), clean({ ...v, id: undefined }));
        else await deleteDoc(doc(elsCol(designId), ids[0]));
        return;
      }
      for (let i = 0; i < ids.length; i += 400) {
        const b = writeBatch(db);
        for (const id of ids.slice(i, i + 400)) {
          const v = s[id];
          if (v) b.set(doc(elsCol(designId), id), clean({ ...v, id: undefined }));
          else b.delete(doc(elsCol(designId), id));
        }
        await b.commit();
      }
    },
    [designId],
  );

  // A change saved, and kept for undo. Changes with the same key close together are one step.
  const commit = useCallback(
    (after: Snap, key?: string) => {
      const m = byId();
      const before: Snap = {};
      for (const id of Object.keys(after)) before[id] = m.get(id) ?? null;
      const last = undo.current[undo.current.length - 1];
      const now = Date.now();
      if (key && last && last.key === key && now - last.at < 900 && Object.keys(after).every((id) => id in last.after)) {
        Object.assign(last.after, after);
        last.at = now;
      } else undo.current.push({ before, after: { ...after }, at: now, key });
      if (undo.current.length > 200) undo.current.shift();
      redo.current = [];
      tick((n) => n + 1);
      return track(after);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [writeSnap],
  );

  const flush = useCallback(
    (key?: string) => {
      window.clearTimeout(timer.current);
      const l = liveRef.current;
      const ids = Object.keys(l);
      if (!ids.length) return;
      const m = byId();
      const after: Snap = {};
      for (const id of ids) {
        const e = m.get(id);
        if (e) after[id] = { ...e, ...l[id] } as El;
      }
      setLiveState({});
      liveRef.current = {};
      commit(after, key);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit],
  );

  // Shown at once; saved after a pause, or when flush is called.
  const setLive = useCallback(
    (patches: Record<string, Partial<El>>, saveAfter = 0, key?: string) => {
      const next = { ...liveRef.current };
      for (const [id, p] of Object.entries(patches)) next[id] = { ...next[id], ...p };
      liveRef.current = next;
      setLiveState(next);
      if (saveAfter) {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => flush(key), saveAfter);
      }
    },
    [flush],
  );

  const patch = useCallback(
    (patches: Record<string, Partial<El>>, key?: string) => {
      const m = byId();
      const after: Snap = {};
      for (const [id, p] of Object.entries(patches)) {
        const e = m.get(id);
        if (e) after[id] = { ...e, ...(liveRef.current[id] ?? {}), ...p } as El;
      }
      commit(after, key);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit],
  );

  const doUndo = useCallback(() => {
    flush();
    const s = undo.current.pop();
    if (!s) return;
    redo.current.push(s);
    tick((n) => n + 1);
    track(s.before);
  }, [flush, writeSnap]);
  const doRedo = useCallback(() => {
    const s = redo.current.pop();
    if (!s) return;
    undo.current.push(s);
    tick((n) => n + 1);
    track(s.after);
  }, [writeSnap]);

  const retry = useCallback(async () => {
    await tail.current;
    const snap = recoveryRef.current;
    if (!Object.keys(snap).length) return true;
    try { await track(snap); return true; } catch { return false; }
  }, [writeSnap]);

  return { live, recovery, setLive, flush, commit, patch, undo: doUndo, redo: doRedo, retry, canUndo: undo.current.length > 0, canRedo: redo.current.length > 0, saving: pending > 0 || Object.keys(live).length > 0, failed };
}

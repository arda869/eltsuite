import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { clean, pagesCol, saveMeta, type DMeta, type DPage } from './model';

type FieldPatch = Partial<DPage> | DMeta;
type SaveState = 'saved' | 'unsaved' | 'saving' | 'waiting' | 'error';

// Page properties and design metadata share one rule: keep the newest local value
// visible until the server confirms it, and retain it for a retry after failure.
export function useDesignFieldSaves(designId: string, serverPages: DPage[] | null) {
  const pending = useRef(new Map<string, FieldPatch>());
  const running = useRef(new Map<string, Promise<boolean>>());
  const timers = useRef(new Map<string, number>());
  const [drafts, setDrafts] = useState<Record<string, FieldPatch>>({});
  const draftRef = useRef(drafts);
  draftRef.current = drafts;
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const storageKey = useCallback((key: string) => `elt.designDraft:${designId}:${key}`, [designId]);
  const state = useCallback((key: string, next: SaveState) => setStates(s => ({ ...s, [key]: next })), []);

  const flush = useCallback(async (key: string): Promise<boolean> => {
    window.clearTimeout(timers.current.get(key));
    if (running.current.has(key)) {
      const ok = await running.current.get(key)!;
      return ok && pending.current.has(key) ? flush(key) : ok;
    }
    const patch = pending.current.get(key);
    if (!patch) return true;
    if (!navigator.onLine) { state(key, 'waiting'); return false; }
    pending.current.delete(key);
    state(key, 'saving');
    const operation = (async () => {
      try {
        if (key === 'meta') await saveMeta(designId, patch as DMeta);
        else await updateDoc(doc(pagesCol(designId), key.slice(5)), clean(patch));
        if (!pending.current.has(key)) {
          const nextDrafts = { ...draftRef.current }; delete nextDrafts[key]; draftRef.current = nextDrafts;
          setDrafts(d => { const next = { ...d }; delete next[key]; return next; });
          try { localStorage.removeItem(storageKey(key)); } catch { /* Server confirmed the value. */ }
          state(key, 'saved');
        } else state(key, 'unsaved');
        return true;
      } catch {
        const newer = pending.current.get(key) ?? {};
        pending.current.set(key, { ...patch, ...newer });
        state(key, navigator.onLine ? 'error' : 'waiting');
        return false;
      }
    })();
    running.current.set(key, operation);
    const ok = await operation;
    running.current.delete(key);
    return ok && pending.current.has(key) ? flush(key) : ok;
  }, [designId, state, storageKey]);

  const change = useCallback((key: string, patch: FieldPatch) => {
    const next = { ...(draftRef.current[key] ?? {}), ...patch };
    draftRef.current = { ...draftRef.current, [key]: next };
    pending.current.set(key, { ...(pending.current.get(key) ?? {}), ...patch });
    setDrafts(d => ({ ...d, [key]: { ...(d[key] ?? {}), ...patch } }));
    try { localStorage.setItem(storageKey(key), JSON.stringify(next)); } catch { /* The memory draft remains. */ }
    state(key, navigator.onLine ? 'unsaved' : 'waiting');
    window.clearTimeout(timers.current.get(key));
    timers.current.set(key, window.setTimeout(() => { void flush(key); }, 650));
  }, [flush, state, storageKey]);

  // A failed write is recoverable after a reload, even when the user changed pages.
  useEffect(() => {
    if (!serverPages) return;
    for (const key of ['meta', ...serverPages.map(p => `page:${p.id}`)]) {
      if (pending.current.has(key)) continue;
      try {
        const stored = localStorage.getItem(storageKey(key));
        if (!stored) continue;
        const patch = JSON.parse(stored) as FieldPatch;
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) continue;
        pending.current.set(key, patch);
        draftRef.current = { ...draftRef.current, [key]: patch };
        setDrafts(d => ({ ...d, [key]: patch }));
        state(key, 'error');
      } catch { /* Invalid local recovery data is ignored. */ }
    }
  }, [serverPages, state, storageKey]);

  useEffect(() => {
    const online = () => { for (const key of pending.current.keys()) void flush(key); };
    const offline = () => { for (const key of pending.current.keys()) state(key, 'waiting'); };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [flush, state]);
  useEffect(() => () => { for (const timer of timers.current.values()) window.clearTimeout(timer); }, []);

  const retry = useCallback(async () => {
    const results = await Promise.all([...pending.current.keys()].map(flush));
    return results.every(Boolean);
  }, [flush]);
  const allStates = Object.values(states);
  const status: SaveState = allStates.includes('error') ? 'error' : allStates.includes('waiting') ? 'waiting' : allStates.includes('saving') ? 'saving' : allStates.includes('unsaved') ? 'unsaved' : 'saved';
  return {
    pageDrafts: drafts as Record<string, Partial<DPage>>,
    metaDraft: (drafts.meta ?? {}) as DMeta,
    status,
    changePage: (id: string, patch: Partial<DPage>) => change(`page:${id}`, patch),
    changeMeta: (patch: DMeta) => change('meta', patch),
    retry,
  };
}

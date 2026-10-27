import { useEffect, useRef, useState } from 'react';

// Text being written, kept for this browser tab until it is sent: leaving the page, switching
// threads or closing a window loses nothing. key null: an ordinary box (editing a post, say).
export function useDraft(key: string | null, initial = ''): [string, (v: string) => void] {
  const full = key ? 'draft:' + key : '';
  const [text, setText] = useState(() => {
    if (!full) return initial;
    try {
      return sessionStorage.getItem(full) ?? initial;
    } catch {
      return initial;
    }
  });
  // A new key (another thread in the same box): its own draft.
  const was = useRef(full);
  useEffect(() => {
    if (was.current === full) return;
    was.current = full;
    try {
      setText((full && sessionStorage.getItem(full)) || initial);
    } catch {
      setText(initial);
    }
  }, [full]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (v: string) => {
    setText(v);
    if (!full) return;
    try {
      if (v.trim()) sessionStorage.setItem(full, v);
      else sessionStorage.removeItem(full);
    } catch {
      /* storage blocked: the draft just is not kept */
    }
  };
  return [text, set];
}

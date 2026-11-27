import { useCallback, useEffect, useRef, useState } from 'react';

type Popout = { window: Window; target: HTMLElement };

// The right-hand controls remain in the teacher's React tree. A portal moves them to
// another browser window, so every live callback and permission is exactly the same.
export function useLivePopout(sessionKey: string) {
  const [popout, setPopout] = useState<Popout | null>(null);
  const [blocked, setBlocked] = useState(false);
  const current = useRef<Window | null>(null);

  const dock = useCallback(() => {
    const other = current.current;
    current.current = null;
    setPopout(null);
    setBlocked(false);
    if (other && !other.closed) other.close();
  }, []);

  const popOut = useCallback(() => {
    if (current.current && !current.current.closed) {
      current.current.focus();
      return;
    }
    // Explicit popup features request a separate movable, resizable window. Browser
    // policy can still block it; in that case the sidebar stays docked.
    const other = window.open('', `elt-live-controls-${sessionKey.replace(/[^A-Za-z0-9_-]/g, '-')}`, 'popup=yes,width=520,height=760,left=120,top=80,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no');
    if (!other) {
      setBlocked(true);
      return;
    }
    try {
      other.document.open();
      other.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Live teaching controls · ELT Suite</title></head><body><div id="live-popout-root"></div></body></html>');
      other.document.close();
      document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((style) => other.document.head.appendChild(style.cloneNode(true)));
      other.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? '';
      const target = other.document.getElementById('live-popout-root');
      if (!target) throw Error('Missing controls root');
      current.current = other;
      setBlocked(false);
      setPopout({ window: other, target });
      other.focus();
    } catch {
      other.close();
      current.current = null;
      setBlocked(true);
    }
  }, [sessionKey]);

  useEffect(() => {
    if (!popout) return;
    const other = popout.window;
    const closed = () => {
      if (current.current !== other) return;
      current.current = null;
      setPopout(null);
    };
    other.addEventListener('pagehide', closed);
    other.addEventListener('beforeunload', closed);
    const poll = window.setInterval(() => { if (other.closed) closed(); }, 750);
    return () => {
      other.removeEventListener('pagehide', closed);
      other.removeEventListener('beforeunload', closed);
      window.clearInterval(poll);
    };
  }, [popout]);

  useEffect(() => () => { if (current.current && !current.current.closed) current.current.close(); }, []);
  return { popout, popOut, dock, blocked };
}

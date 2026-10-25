import { useLayoutEffect, useState, type RefObject } from 'react';

// Places a popover under its anchor using fixed positioning, so it is never cut off by a
// scrolling panel, and keeps it inside the window.
export function usePopPos(anchor: RefObject<HTMLElement>, open: boolean, width: number, gap = 6) {
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = window.innerHeight - r.bottom - gap - 8;
      const above = r.top - gap - 8;
      if (below >= 320 || below >= above) setPos({ top: r.bottom + gap, left, maxHeight: below });
      else setPos({ top: Math.max(8, r.top - gap - Math.min(above, 560)), left, maxHeight: Math.min(above, 560) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, width, gap]);
  return pos ? { position: 'fixed' as const, top: pos.top, left: pos.left, maxHeight: pos.maxHeight, overflow: 'auto' as const } : { visibility: 'hidden' as const };
}

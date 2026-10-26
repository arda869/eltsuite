import { useLayoutEffect, useState, type RefObject } from 'react';

// Places a popover under its anchor using fixed positioning, so it is never cut off by a
// scrolling panel, and keeps it inside the window.
export function usePopPos(anchor: RefObject<HTMLElement>, open: boolean, width: number, gap = 6) {
  // Below the anchor: top is set. Above it: bottom is set, so the popover sits right on the anchor
  // whatever its height.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    let raf = 0;
    let tries = 0;
    const place = () => {
      const el = anchor.current;
      const r = el?.getBoundingClientRect();
      // A gap that has just been added is drawn a moment after this runs; until it is on the page
      // its box is empty and the popover would land in the top-left corner. Wait for it.
      if (!el || !r || !el.isConnected || (r.width === 0 && r.height === 0 && r.top === 0 && r.left === 0)) {
        if (tries++ < 30) raf = requestAnimationFrame(place);
        return;
      }
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = window.innerHeight - r.bottom - gap - 8;
      const above = r.top - gap - 8;
      if (below >= 320 || below >= above) setPos({ top: r.bottom + gap, left, maxHeight: below });
      else setPos({ bottom: window.innerHeight - r.top + gap, left, maxHeight: Math.min(above, 560) });
    };
    place();
    // Follow the anchor if the text around it moves (typing, a panel opening).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => ((tries = 0), place())) : null;
    if (anchor.current) ro?.observe(anchor.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, width, gap]);
  return pos ? { position: 'fixed' as const, top: pos.top ?? 'auto', bottom: pos.bottom ?? 'auto', right: 'auto', left: pos.left, maxHeight: pos.maxHeight, overflow: 'auto' as const } : { visibility: 'hidden' as const };
}

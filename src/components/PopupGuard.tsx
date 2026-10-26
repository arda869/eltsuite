import { useEffect } from 'react';

// Every pop-up (menus, colour and symbol pickers, the definition card, gap settings) stays on
// the screen: when one would open past an edge it is moved back in, and one taller than the
// screen gets a scroll bar. One watcher for the whole app, so no pop-up can be missed.
const POPUPS = [
  '.menu',
  '[role="menu"]',
  '.gap-pop',
  '.def-pop',
  '.def-card',
  '.hl-pop',
  '.sym-pop',
  '.emo-pop',
  '.ctx-menu',
  '.va-menu',
  '.ts-pop',
  '.timer-menu',
  '.tb-menu',
  '.stress-pop',
  '.sig-pop',
  '.pic-pop',
  '.mp-speed-menu',
  '.mention-menu',
  '.ma-add-menu',
  '.link-pop',
  '.lb-menu',
  '.item-menu',
  '.ipa-pop',
  '.choice-pop',
  '.cd-dl-menu',
  '.rx-pick',
  '.tc-pop',
].join(',');
const M = 8; // keep this far from the edges

// Last offset applied to each pop-up, so measuring never needs a reset (no layout thrash, no loop).
const applied = new WeakMap<Element, { dx: number; dy: number; mh: number }>();
const fits = new WeakMap<Element, number>();

function fit(el: HTMLElement) {
  if (!el.isConnected) return;
  // A pop-up re-fitted over and over (its own code moving it each frame) is left alone.
  const n = (fits.get(el) ?? 0) + 1;
  fits.set(el, n);
  if (n > 60) return;
  const prev = applied.get(el) ?? { dx: 0, dy: 0, mh: 0 };
  const r0 = el.getBoundingClientRect();
  if (!r0.width || !r0.height) return;
  // Where it would be without our nudge.
  const r = { left: r0.left - prev.dx, right: r0.right - prev.dx, top: r0.top - prev.dy, height: r0.height };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = M + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--proxy-h')) || 0);
  const room = Math.round(vh - top - M);
  let mh = prev.mh;
  if (!mh && r.height > room) mh = room;
  const h = Math.min(r.height, room);
  let dx = 0;
  let dy = 0;
  if (r.right > vw - M) dx = vw - M - r.right;
  if (r.left + dx < M) dx = M - r.left;
  if (r.top + h > vh - M) dy = vh - M - (r.top + h);
  if (r.top + dy < top) dy = top - r.top;
  dx = Math.round(dx);
  dy = Math.round(dy);
  if (dx === prev.dx && dy === prev.dy && mh === prev.mh) return;
  applied.set(el, { dx, dy, mh });
  if (mh !== prev.mh) {
    el.style.maxHeight = `${mh}px`;
    el.style.overflowY = 'auto';
  }
  el.style.translate = dx || dy ? `${dx}px ${dy}px` : '';
}

export function PopupGuard() {
  useEffect(() => {
    const watched = new WeakSet<Element>();
    // All work waits for the next frame and is done once per pop-up per frame.
    const queue = new Set<HTMLElement>();
    const added: Node[] = [];
    let raf = 0;
    const run = () => {
      raf = 0;
      const nodes = added.splice(0);
      for (const n of nodes) {
        if (!(n instanceof Element) || !n.isConnected) continue;
        if (n.matches(POPUPS)) take(n);
        if (n.firstElementChild) n.querySelectorAll(POPUPS).forEach(take);
      }
      const els = [...queue];
      queue.clear();
      els.forEach(fit);
    };
    const later = () => (raf ||= requestAnimationFrame(run));
    const ro = new ResizeObserver((entries) => {
      entries.forEach((e) => queue.add(e.target as HTMLElement));
      later();
    });
    const take = (el: Element) => {
      if (watched.has(el)) return;
      watched.add(el);
      fits.delete(el);
      queue.add(el as HTMLElement);
      ro.observe(el);
      window.setTimeout(() => (fits.delete(el), queue.add(el as HTMLElement), later()), 120); // once its position settles
    };
    const mo = new MutationObserver((list) => {
      for (const m of list) m.addedNodes.forEach((n) => n.nodeType === 1 && added.push(n));
      if (added.length) later();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    added.push(document.body);
    later();
    const again = () => document.querySelectorAll<HTMLElement>(POPUPS).forEach((el) => (fits.delete(el), queue.add(el), later()));
    window.addEventListener('resize', again);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener('resize', again);
    };
  }, []);
  return null;
}

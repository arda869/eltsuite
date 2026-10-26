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

function fit(el: HTMLElement) {
  if (!el.isConnected) return;
  el.style.translate = '';
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // The banner of a "view as a learner" tab covers the top of the screen.
  const top = M + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--proxy-h')) || 0);
  if (r.height > vh - top - M) {
    el.style.maxHeight = `${vh - top - M}px`;
    el.style.overflowY = 'auto';
  }
  const h = Math.min(r.height, vh - top - M);
  let dx = 0;
  let dy = 0;
  if (r.right > vw - M) dx = vw - M - r.right;
  if (r.left + dx < M) dx = M - r.left;
  if (r.top + h > vh - M) dy = vh - M - (r.top + h);
  if (r.top + dy < top) dy = top - r.top;
  if (dx || dy) el.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
}

export function PopupGuard() {
  useEffect(() => {
    const watched = new WeakSet<Element>();
    const ro = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target as HTMLElement)));
    const take = (el: Element) => {
      if (watched.has(el)) return;
      watched.add(el);
      requestAnimationFrame(() => {
        fit(el as HTMLElement);
        requestAnimationFrame(() => fit(el as HTMLElement)); // again, once its position settles
      });
      ro.observe(el);
    };
    const scan = (n: Node) => {
      if (!(n instanceof Element)) return;
      if (n.matches(POPUPS)) take(n);
      n.querySelectorAll(POPUPS).forEach(take);
    };
    const mo = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(scan)));
    mo.observe(document.body, { childList: true, subtree: true });
    scan(document.body);
    const again = () => document.querySelectorAll<HTMLElement>(POPUPS).forEach(fit);
    window.addEventListener('resize', again);
    return () => {
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener('resize', again);
    };
  }, []);
  return null;
}

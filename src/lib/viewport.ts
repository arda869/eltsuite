// The part of the screen you can see, kept in CSS variables: when the on-screen keyboard opens on a
// phone, the visible area shrinks (and on iPhones, moves), but the page does not. Full-screen views
// such as an open chat use --vv-h and --vv-top, so what you type stays just above the keyboard.
export function startViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const h = document.documentElement;
  let raf = 0;
  const set = () => {
    raf = 0;
    h.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
    h.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    h.style.setProperty('--kb', `${Math.round(kb)}px`);
    h.toggleAttribute('data-keyboard', kb > 120);
  };
  const soon = () => {
    if (!raf) raf = requestAnimationFrame(set);
  };
  vv.addEventListener('resize', soon);
  vv.addEventListener('scroll', soon);
  set();
  // A field coming into focus on a phone: keep it in view once the keyboard is up.
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || window.innerWidth > 820 || !el.matches('input, textarea, [contenteditable="true"], .ProseMirror')) return;
    window.setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 280);
  });
}

// Browser zoom works everywhere (pinch, Ctrl/Cmd and the wheel, Ctrl/Cmd and + or −): people with low
// vision rely on it. The exception is a surface that zooms itself (Collab's pages, Design, the
// whiteboard, anything with touch-action: none): there a pinch or Ctrl+wheel zooms that surface, not
// the whole page. Double-tap zoom is off through touch-action in cohesion.css, so fast taps still work.
const zoomsItself = (t: EventTarget | null) => {
  for (let el = t instanceof Element ? t : null; el && el !== document.documentElement; el = el.parentElement) {
    if (getComputedStyle(el).touchAction === 'none') return true;
  }
  return false;
};
export function stopPinchZoom() {
  const stop = (e: Event) => { if (e.cancelable && zoomsItself(e.target)) e.preventDefault(); };
  // iPhone and iPad Safari send their own gesture events for a pinch.
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) stop(e); }, { passive: false });
  // A trackpad pinch on a computer arrives as a wheel event with Ctrl held.
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) stop(e); }, { passive: false });
}

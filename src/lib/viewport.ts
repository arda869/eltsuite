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

// No pinch-to-zoom anywhere in the suite: the page is laid out for the screen it's on, and a
// half-zoomed page hides the controls. Places with their own zoom (Collab's pages, Design and the
// whiteboard) listen on their own element, so they still get two-finger gestures; this only stops
// the browser zooming the whole page. Ctrl/Cmd and + or − (the browser's own zoom) still works,
// for anyone who needs everything bigger.
export function stopPinchZoom() {
  const stop = (e: Event) => { if (e.cancelable) e.preventDefault(); };
  // iPhone and iPad Safari ignore the viewport tag's limits, so stop its gesture events too.
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) stop(e); }, { passive: false });
  // A trackpad pinch on a computer arrives as a wheel event with Ctrl held.
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) stop(e); }, { passive: false });
  // Double-tap zoom is off through touch-action in cohesion.css, which leaves fast taps working.
}

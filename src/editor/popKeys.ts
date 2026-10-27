// Escape in an element's small settings panel (a gap's answers, IPA, word stress, symbols,
// a sound card…): the panel closes the way a click outside closes it, so nothing typed is lost,
// and the cursor goes back to the text. Only that panel closes, never the window around it.
// Installed once, by TaskEditor.
const POPS = '.gap-pop, .hl-pop, .ipa-pop';
let on = false;
export function installPopKeys() {
  if (on || typeof document === 'undefined') return;
  on = true;
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const pop = t?.closest?.(POPS) as HTMLElement | null;
      if (!pop || pop.closest('.toolbar')) return; // the toolbar's own panels handle their keys
      e.preventDefault();
      e.stopPropagation();
      const pm = pop.closest('.ProseMirror') as HTMLElement | null;
      const opts = { bubbles: true, cancelable: true, view: window };
      document.body.dispatchEvent(new PointerEvent('pointerdown', opts));
      document.body.dispatchEvent(new MouseEvent('mousedown', opts));
      document.body.dispatchEvent(new MouseEvent('mouseup', opts));
      window.setTimeout(() => {
        const now = document.activeElement;
        if (pm?.isConnected && (!now || now === document.body || !now.isConnected || pop.contains(now))) pm.focus({ preventScroll: true });
      }, 0);
    },
    true,
  );
}

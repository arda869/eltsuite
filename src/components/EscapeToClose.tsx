import { useEffect } from 'react';

// Escape closes the dialog on top, as a click outside it would.
export function EscapeToClose() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const scrims = document.querySelectorAll<HTMLElement>('.scrim, .nb-drawer-scrim');
      const top = scrims[scrims.length - 1];
      if (!top) return;
      // An open menu or picker inside the dialog closes first (they listen for Escape themselves).
      if (top.querySelector('.menu, .hl-pop, .def-pop, .gap-pop')) return;
      top.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return null;
}

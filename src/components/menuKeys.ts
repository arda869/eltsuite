import { useEffect, useRef, type RefObject } from 'react';

// Keys for every menu (role="menu" with role="menuitem" buttons): ↑ ↓ Home End move, a letter jumps
// to the next item starting with it, Enter or Space chooses (the buttons' own click), Escape and
// Tab close. Focus goes into the menu when it opens and back where it was when it closes.
// first: put focus on the first item (opened from the keyboard) rather than on the menu itself.
export function useMenuKeys(ref: RefObject<HTMLElement>, open: unknown, close: () => void, first = false) {
  const back = useRef<HTMLElement | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const menu = ref.current;
    if (!menu) return;
    back.current = document.activeElement as HTMLElement | null;
    const items = () => Array.from(menu.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled]), [role=menuitemradio]:not([disabled])'));
    if (!menu.hasAttribute('tabindex')) menu.tabIndex = -1;
    // After the menu has its place on screen (it is measured hidden first).
    const t = window.setTimeout(() => (first ? items()[0] ?? menu : menu).focus({ preventScroll: true }), 0);
    const key = (e: KeyboardEvent) => {
      const list = items();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLElement);
      const go = (j: number) => (e.preventDefault(), e.stopPropagation(), list[(j + list.length) % list.length].focus());
      if (e.key === 'ArrowDown') go(i + 1);
      else if (e.key === 'ArrowUp') go(i < 0 ? -1 : i - 1);
      else if (e.key === 'Home' || e.key === 'PageUp') go(0);
      else if (e.key === 'End' || e.key === 'PageDown') go(-1);
      else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        closeRef.current();
      } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const ch = e.key.toLowerCase();
        const order = [...list.slice(i + 1), ...list.slice(0, i + 1)];
        const hit = order.find((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(ch));
        if (hit) (e.preventDefault(), e.stopPropagation(), hit.focus());
      }
    };
    menu.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(t);
      menu.removeEventListener('keydown', key);
      // Back to where the cursor was, unless the click that closed the menu put it somewhere else.
      const el = back.current;
      back.current = null;
      window.setTimeout(() => {
        const now = document.activeElement;
        if (el?.isConnected && (!now || now === document.body || menu.contains(now) || !now.isConnected)) el.focus({ preventScroll: true });
      }, 0);
    };
  }, [open, ref, first]);
}

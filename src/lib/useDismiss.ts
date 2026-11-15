import { useEffect, useRef } from 'react';

// Menus and pop-ups close when you click anywhere else, or press Escape.
export function useDismiss<T extends HTMLElement = HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  const fn = useRef(close);
  fn.current = close;
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => {
      const root = ref.current;
      const target = e.target;
      if (!root || !(target instanceof Node) || root.contains(target)) return;
      // Select renders its choices in a portal. Keep this menu open while a choice
      // belonging to a Select inside it is pressed, so the choice can receive click.
      const list = target instanceof Element ? target.closest('.sel-list') : null;
      const listId = list?.querySelector('[role="listbox"]')?.id;
      if (listId && Array.from(root.querySelectorAll('[aria-controls]')).some((control) => control.getAttribute('aria-controls') === listId)) return;
      fn.current();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && fn.current();
    document.addEventListener('mousedown', down);
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('touchstart', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return ref;
}

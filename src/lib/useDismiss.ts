import { useEffect, useRef } from 'react';

// Menus and pop-ups close when you click anywhere else, or press Escape.
export function useDismiss<T extends HTMLElement = HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  const fn = useRef(close);
  fn.current = close;
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => ref.current && !ref.current.contains(e.target as Node) && fn.current();
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

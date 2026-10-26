import { useEffect, useState } from 'react';

// True while a media query matches, for example a phone-sized screen.
export function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    f();
    return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}
// Phones: teaching, marking and messages work; building lessons waits for a larger screen.
export const PHONE = '(max-width: 640px)';
export const usePhone = () => useMedia(PHONE);

import { useEffect, useState } from 'react';

// Remembered open/closed state for the side panels of a lesson screen.
export function usePanels(key: string, compactWidth = 0) {
  const read = (k: string) => {
    try {
      return localStorage.getItem(k) !== '0';
    } catch {
      return true;
    }
  };
  const [left, setLeft] = useState(() => read(key + '.left'));
  const [right, setRight] = useState(() => read(key + '.right'));
  const save = (k: string, v: boolean) => {
    try {
      localStorage.setItem(k, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const [compact, setCompact] = useState(() => compactWidth > 0 && window.matchMedia(`(max-width: ${compactWidth}px)`).matches);
  const [compactLeft, setCompactLeft] = useState(false);
  const [compactRight, setCompactRight] = useState(false);
  useEffect(() => {
    if (!compactWidth) return;
    const media = window.matchMedia(`(max-width: ${compactWidth}px)`);
    const update = () => { setCompact(media.matches); setCompactLeft(false); setCompactRight(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [compactWidth]);
  const shownLeft = compact ? compactLeft : left;
  const shownRight = compact ? compactRight : right;
  return {
    compact,
    left: shownLeft,
    right: shownRight,
    toggleLeft: () => compact ? (setCompactRight(false), setCompactLeft(v => !v)) : setLeft((v) => (save(key + '.left', !v), !v)),
    toggleRight: () => compact ? (setCompactLeft(false), setCompactRight(v => !v)) : setRight((v) => (save(key + '.right', !v), !v)),
    cls: (shownLeft ? '' : ' no-left') + (shownRight ? '' : ' no-right') + (compact ? ' compact-panels' : ''),
  };
}

// An arrow pointing the way the panel will move: in to hide it, out to show it.
const CHEV = (dir: 'l' | 'r') => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);

export function PanelToggle({ side, open, onClick, label }: { side: 'left' | 'right'; open: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className={'panel-toggle ' + side + (open ? ' is-open' : '')} onClick={onClick} title={(open ? 'Hide ' : 'Show ') + label} aria-label={(open ? 'Hide ' : 'Show ') + label} aria-pressed={open}>
      {CHEV((side === 'left') === open ? 'l' : 'r')}
    </button>
  );
}

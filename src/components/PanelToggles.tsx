import { useState } from 'react';

// Remembered open/closed state for the side panels of a lesson screen.
export function usePanels(key: string) {
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
  return {
    left,
    right,
    toggleLeft: () => setLeft((v) => (save(key + '.left', !v), !v)),
    toggleRight: () => setRight((v) => (save(key + '.right', !v), !v)),
    cls: (left ? '' : ' no-left') + (right ? '' : ' no-right'),
  };
}

const CHEV = (dir: 'l' | 'r') => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d={dir === 'l' ? 'M9 4.5v15' : 'M15 4.5v15'} />
  </svg>
);

export function PanelToggle({ side, open, onClick, label }: { side: 'left' | 'right'; open: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className={'panel-toggle ' + side + (open ? ' is-open' : '')} onClick={onClick} title={(open ? 'Hide ' : 'Show ') + label} aria-label={(open ? 'Hide ' : 'Show ') + label} aria-pressed={open}>
      {CHEV(side === 'left' ? 'l' : 'r')}
    </button>
  );
}

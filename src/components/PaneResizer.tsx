import { useCallback, useEffect, useState } from 'react';

// Drag handles between the side panes and the task. Widths are remembered on this device.
const LIMITS = { left: [160, 460], right: [220, 620] } as const;
const KEY = 'll.paneWidths';

export function usePaneWidths(defaults = { left: 220, right: 260 }) {
  const [w, setW] = useState<{ left: number; right: number }>(() => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      return defaults;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(w));
    } catch {
      /* private window */
    }
  }, [w]);
  const set = useCallback((side: 'left' | 'right', px: number) => setW((cur) => ({ ...cur, [side]: Math.round(Math.min(LIMITS[side][1], Math.max(LIMITS[side][0], px))) })), []);
  const reset = useCallback((side: 'left' | 'right') => setW((cur) => ({ ...cur, [side]: defaults[side] })), [defaults]);
  return { widths: w, set, reset, style: { ['--lw' as string]: `${w.left}px`, ['--rw' as string]: `${w.right}px` } };
}

export function PaneResizer({ side, width, onWidth, onReset }: { side: 'left' | 'right'; width: number; onWidth: (px: number) => void; onReset: () => void }) {
  const [drag, setDrag] = useState(false);
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    setDrag(true);
    const move = (ev: PointerEvent) => onWidth(side === 'left' ? w0 + (ev.clientX - x0) : w0 - (ev.clientX - x0));
    const up = () => {
      setDrag(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      className={'pane-resizer ' + side + (drag ? ' on' : '')}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Resize the task list' : 'Resize the side panel'}
      tabIndex={0}
      data-tip="Drag to resize · double-click to reset"
      onPointerDown={start}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onWidth(width + (side === 'left' ? -20 : 20));
        if (e.key === 'ArrowRight') onWidth(width + (side === 'left' ? 20 : -20));
      }}
    />
  );
}

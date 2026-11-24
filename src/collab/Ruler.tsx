import { useEffect, useRef, useState } from 'react';
import { PX_PER_CM, type PageMargins } from './documentLayout';

// The ruler above a paged document, as in Google Docs: centimetres from the left margin, the
// margins shaded, and a handle at each side to drag the left and right margins (arrow keys move
// them by 0.25 cm). It has the page's width and zoom.
export function Ruler({ width, zoom, margins, onChange, canEdit }: { width: number; zoom: number; margins: PageMargins; onChange: (m: PageMargins) => void; canEdit: boolean }) {
  const [drag, setDrag] = useState<PageMargins | null>(null);
  // Drawn at the page's zoom, but the ruler's own text and height stay readable.
  const k = zoom / 100;
  const m = drag ?? margins;
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef(m);
  live.current = m;
  const step = PX_PER_CM / 4;
  const clamp = (side: 'left' | 'right', px: number, from: PageMargins) => Math.max(0, Math.min(width - (side === 'left' ? from.right : from.left) - 96, px));
  const start = (side: 'left' | 'right') => (e: React.PointerEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    const box = ref.current!.getBoundingClientRect();
    const k = box.width / width;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = (ev.clientX - box.left) / k;
      const base = live.current;
      const snapped = Math.round((side === 'left' ? x : width - x) / step) * step;
      setDrag({ ...base, [side]: clamp(side, snapped, base) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const final = live.current;
      setDrag(null);
      if (final.left !== margins.left || final.right !== margins.right) onChange(final);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  useEffect(() => () => setDrag(null), []);
  const key = (side: 'left' | 'right') => (e: React.KeyboardEvent) => {
    if (!canEdit || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const dir = (e.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1);
    onChange({ ...margins, [side]: clamp(side, margins[side] + dir * step, margins) });
  };
  // Ticks every quarter centimetre, numbered from the left margin, as in a word processor.
  const ticks: { x: number; kind: 'cm' | 'half' | 'q'; n?: number }[] = [];
  for (let i = -Math.floor((m.left / PX_PER_CM) * 4); ; i++) {
    const x = m.left + (i * PX_PER_CM) / 4;
    if (x > width) break;
    if (x < 0) continue;
    ticks.push({ x, kind: i % 4 === 0 ? 'cm' : i % 2 === 0 ? 'half' : 'q', n: i % 4 === 0 ? Math.abs(i / 4) : undefined });
  }
  const cm = (px: number) => `${(Math.round((px / PX_PER_CM) * 100) / 100).toString()} cm`;
  return (
    <div className="pg-ruler" ref={ref} style={{ width: width * k }} aria-label="Ruler">
      <span className="pg-ruler-off" style={{ left: 0, width: m.left * k }} />
      <span className="pg-ruler-off" style={{ right: 0, width: m.right * k }} />
      {ticks.filter((t) => k >= 0.7 || t.kind !== 'q').map((t, i) => (
        <span key={i} className={'pg-tick ' + t.kind} style={{ left: t.x * k }}>{t.n && (k >= 0.6 || t.n % 2 === 0) ? <b>{t.n}</b> : null}</span>
      ))}
      {(['left', 'right'] as const).map((side) => (
        <span
          key={side}
          className={'pg-handle ' + side + (drag ? ' dragging' : '')}
          style={side === 'left' ? { left: m.left * k } : { left: (width - m.right) * k }}
          role="slider"
          tabIndex={canEdit ? 0 : -1}
          aria-label={side === 'left' ? 'Left margin' : 'Right margin'}
          aria-valuenow={Math.round((m[side] / PX_PER_CM) * 100) / 100}
          aria-valuetext={cm(m[side])}
          aria-valuemin={0}
          aria-disabled={!canEdit || undefined}
          title={`${side === 'left' ? 'Left' : 'Right'} margin: ${cm(m[side])}`}
          onPointerDown={start(side)}
          onKeyDown={key(side)}
        >
          {drag && <i className="pg-handle-tip">{cm(m[side])}</i>}
        </span>
      ))}
    </div>
  );
}

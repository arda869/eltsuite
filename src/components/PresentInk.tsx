import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { getStroke } from 'perfect-freehand';

// Teaching screen: draw on the task or highlight text while presenting. Nothing is saved or
// sent to learners; it disappears when the teacher clears it or moves to another task.

export type InkMode = 'off' | 'pen' | 'highlight';
export const INK_COLORS = ['#d98f63', '#2f5fa8', '#2f2e2d'];
export const HIGHLIGHTS = ['rgba(250, 221, 90, 0.5)', 'rgba(150, 200, 245, 0.45)', 'rgba(240, 160, 190, 0.45)'];

type Line = { pts: number[][]; color: string };

function pathOf(points: number[][]) {
  const o = getStroke(points, { size: 5, thinning: 0.5, smoothing: 0.6, streamline: 0.5, simulatePressure: true });
  if (!o.length) return '';
  const d = o.reduce((acc, [x0, y0], i, arr) => {
    const [x1, y1] = arr[(i + 1) % arr.length];
    acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    return acc;
  }, ['M', ...o[0], 'Q'] as (string | number)[]);
  d.push('Z');
  return d.join(' ');
}

export function PresentInk({ container, mode, color, highlight, clearKey }: { container: RefObject<HTMLElement>; mode: InkMode; color: string; highlight: string; clearKey: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<Line | null>(null);
  const [marks, setMarks] = useState<{ range: Range; color: string }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [, setTick] = useState(0);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setLines([]);
    setMarks([]);
  }, [clearKey]);

  // Cover the whole scrolling text and re-measure highlights when it changes size.
  // (The container's ref is set after this layer mounts, so start on the next frame.)
  useLayoutEffect(() => {
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const el = container.current;
      if (!el) return;
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
      setTick((t) => t + 1);
    };
    const raf = requestAnimationFrame(() => {
      measure();
      if (container.current) {
        ro = new ResizeObserver(measure);
        ro.observe(container.current);
      }
    });
    window.addEventListener('resize', measure);
    return () => (cancelAnimationFrame(raf), ro?.disconnect(), window.removeEventListener('resize', measure));
  }, [container, clearKey]);

  // Highlight: select text with the mouse; the highlight replaces the selection.
  useEffect(() => {
    const el = container.current;
    if (!el || mode !== 'highlight') return;
    const up = () =>
      window.setTimeout(() => {
        const s = window.getSelection();
        if (!s || s.isCollapsed || !s.rangeCount) return;
        const r = s.getRangeAt(0);
        if (!el.contains(r.commonAncestorContainer)) return;
        setMarks((m) => [...m, { range: r.cloneRange(), color: highlight }]);
        s.removeAllRanges();
      }, 0);
    el.addEventListener('mouseup', up);
    return () => el.removeEventListener('mouseup', up);
  }, [container, mode, highlight]);

  const at = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top, e.pressure || 0.5];
  };
  const base = container.current?.getBoundingClientRect();
  const el = container.current;
  return (
    <>
      <div className="ink-marks" aria-hidden="true">
        {base &&
          el &&
          marks.flatMap((m, i) =>
            [...m.range.getClientRects()]
              .filter((x) => x.width > 1)
              .map((x, k) => <span key={i + ':' + k} className="ink-mark" style={{ left: x.left - base.left + el.scrollLeft, top: x.top - base.top + el.scrollTop, width: x.width, height: x.height, background: m.color }} />),
          )}
      </div>
      <svg
        ref={svg}
        className={'ink-layer' + (mode === 'pen' ? ' drawing' : '')}
        width={size.w}
        height={size.h}
        onPointerDown={(e) => {
          if (mode !== 'pen') return;
          e.preventDefault();
          e.stopPropagation();
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDraft({ pts: [at(e)], color });
        }}
        onPointerMove={(e) => draft && setDraft({ ...draft, pts: [...draft.pts, at(e)] })}
        onPointerUp={() => {
          if (draft) setLines((l) => [...l, draft]);
          setDraft(null);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {[...lines, ...(draft ? [draft] : [])].map((l, i) => (
          <path key={i} d={pathOf(l.pts)} fill={l.color} />
        ))}
      </svg>
    </>
  );
}

// The small floating toolbar for the teaching screen.
export function InkBar({ mode, setMode, color, setColor, highlight, setHighlight, onClear }: { mode: InkMode; setMode: (m: InkMode) => void; color: string; setColor: (c: string) => void; highlight: string; setHighlight: (c: string) => void; onClear: () => void }) {
  if (mode === 'off') return null;
  return (
    <div className="ink-bar" role="toolbar" aria-label="Draw on the screen">
      <span className="seg small-seg">
        <button type="button" className={mode === 'pen' ? 'on' : ''} onClick={() => setMode('pen')}>
          Pen
        </button>
        <button type="button" className={mode === 'highlight' ? 'on' : ''} onClick={() => setMode('highlight')}>
          Highlight
        </button>
      </span>
      {(mode === 'pen' ? INK_COLORS : HIGHLIGHTS).map((c) => (
        <button key={c} type="button" className={'wb-color' + ((mode === 'pen' ? color : highlight) === c ? ' on' : '')} style={{ background: c }} aria-label="Colour" onClick={() => (mode === 'pen' ? setColor(c) : setHighlight(c))} />
      ))}
      <button type="button" className="btn link small" onClick={onClear}>
        Clear
      </button>
      <button type="button" className="btn small-btn" onClick={() => setMode('off')}>
        Done
      </button>
      <span className="hint">{mode === 'pen' ? 'Draw on the task. Not saved.' : 'Select text to highlight it. Not saved.'}</span>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { PX_PER_CM, type PageMargins } from './documentLayout';
import { indentsOf, setIndents, type Indents } from './DocumentStructure';

// The ruler above a paged document, as in a word processor: centimetres from the left margin, the
// margins shaded (drag the edge of the shading to change a margin), the indents of the paragraph you
// are in (first line, left and right), and tab stops: click the ruler to add one, drag it to move it,
// drag it off the ruler (or double-click it) to remove it. Tab moves to the next stop.
// Everything snaps to a quarter of a centimetre; arrow keys move a focused marker.
type Drag =
  | { k: 'margin'; side: 'left' | 'right'; m: PageMargins }
  | { k: 'indent'; part: 'left' | 'first' | 'right'; i: Indents }
  | { k: 'tab'; from: number; at: number | null };

export function Ruler({ width, zoom, margins, onChange, canEdit, editor, tabs = [], onTabs }: { width: number; zoom: number; margins: PageMargins; onChange: (m: PageMargins) => void; canEdit: boolean; editor?: Editor; tabs?: number[]; onTabs?: (t: number[]) => void }) {
  const k = zoom / 100;
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<Drag | null>(null);
  live.current = drag;
  const step = PX_PER_CM / 4;
  const snap = (x: number) => Math.round(x / step) * step;
  // The paragraph the cursor is in.
  const [cur, setCur] = useState<Indents | null>(null);
  useEffect(() => {
    if (!editor) return;
    const read = () => {
      const { $from } = editor.state.selection;
      const p = $from.parent;
      setCur(['paragraph', 'heading'].includes(p.type.name) && !editor.isActive('listItem') && !editor.isActive('taskItem') ? indentsOf(p.attrs) : null);
    };
    read();
    editor.on('transaction', read);
    return () => { editor.off('transaction', read); };
  }, [editor]);
  const m = drag?.k === 'margin' ? drag.m : margins;
  const ind = drag?.k === 'indent' ? drag.i : cur;
  const textW = width - m.left - m.right;
  const xOf = (e: { clientX: number }) => {
    const box = ref.current!.getBoundingClientRect();
    return (e.clientX - box.left) / (box.width / width);
  };
  const follow = (onMove: (ev: PointerEvent) => void, onUp: (ev: PointerEvent) => void) => {
    const up = (ev: PointerEvent) => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', up); onUp(ev); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
  };

  // Margins.
  const clampM = (side: 'left' | 'right', px: number, from: PageMargins) => Math.max(0, Math.min(width - (side === 'left' ? from.right : from.left) - 96, px));
  const startMargin = (side: 'left' | 'right') => (e: React.PointerEvent) => {
    if (!canEdit) return;
    e.preventDefault(); e.stopPropagation();
    setDrag({ k: 'margin', side, m: margins });
    follow((ev) => {
      const x = xOf(ev);
      setDrag({ k: 'margin', side, m: { ...margins, [side]: clampM(side, snap(side === 'left' ? x : width - x), margins) } });
    }, () => {
      const d = live.current;
      setDrag(null);
      if (d?.k === 'margin' && (d.m.left !== margins.left || d.m.right !== margins.right)) onChange(d.m);
    });
  };
  const keyMargin = (side: 'left' | 'right') => (e: React.KeyboardEvent) => {
    if (!canEdit || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const dir = (e.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1);
    onChange({ ...margins, [side]: clampM(side, margins[side] + dir * step, margins) });
  };

  // Indents. Moving the left indent keeps the first line where it is, as in a word processor.
  const fitIndent = (part: 'left' | 'first' | 'right', x: number, i: Indents): Indents => {
    const rel = snap(x - m.left);
    if (part === 'right') return { ...i, right: Math.max(0, Math.min(textW - i.left - 48, snap(width - m.right - x))) };
    if (part === 'first') return { ...i, first: Math.max(-i.left, Math.min(textW - i.right - 48, rel)) - i.left };
    const left = Math.max(0, Math.min(textW - i.right - 48, rel));
    const firstAt = Math.max(0, i.left + i.first);
    return { ...i, left, first: firstAt - left };
  };
  const startIndent = (part: 'left' | 'first' | 'right') => (e: React.PointerEvent) => {
    if (!canEdit || !editor || !cur) return;
    e.preventDefault(); e.stopPropagation();
    const base = cur;
    setDrag({ k: 'indent', part, i: base });
    follow((ev) => setDrag({ k: 'indent', part, i: fitIndent(part, xOf(ev), base) }), () => {
      const d = live.current;
      setDrag(null);
      if (d?.k === 'indent') setIndents(editor, () => d.i);
    });
  };
  const keyIndent = (part: 'left' | 'first' | 'right') => (e: React.KeyboardEvent) => {
    if (!canEdit || !editor || !cur || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const at = part === 'right' ? width - m.right - cur.right : m.left + cur.left + (part === 'first' ? cur.first : 0);
    const next = fitIndent(part, at + dir * step, cur);
    setIndents(editor, () => next);
  };

  // Tab stops, from the left margin.
  const sorted = [...tabs].sort((p, q) => p - q);
  const addTab = (e: React.PointerEvent) => {
    if (!canEdit || !onTabs || e.button !== 0) return;
    const x = snap(xOf(e) - m.left);
    if (x <= 0 || x >= textW) return;
    if (!sorted.some((t) => Math.abs(t - x) < 2)) onTabs([...sorted, x].sort((p, q) => p - q));
  };
  const startTab = (t: number) => (e: React.PointerEvent) => {
    if (!canEdit || !onTabs) return;
    e.preventDefault(); e.stopPropagation();
    setDrag({ k: 'tab', from: t, at: t });
    const top = ref.current!.getBoundingClientRect();
    follow((ev) => {
      const off = ev.clientY < top.top - 24 || ev.clientY > top.bottom + 24;
      setDrag({ k: 'tab', from: t, at: off ? null : Math.max(step, Math.min(textW - step, snap(xOf(ev) - m.left))) });
    }, () => {
      const d = live.current;
      setDrag(null);
      if (d?.k !== 'tab') return;
      const rest = sorted.filter((x) => x !== t);
      onTabs(d.at == null ? rest : [...rest.filter((x) => Math.abs(x - d.at!) >= 2), d.at].sort((p, q) => p - q));
    });
  };
  const shownTabs = drag?.k === 'tab' ? [...sorted.filter((x) => x !== drag.from), ...(drag.at != null ? [drag.at] : [])] : sorted;

  // Ticks every quarter centimetre, numbered from the left margin.
  const ticks: { x: number; kind: 'cm' | 'half' | 'q'; n?: number }[] = [];
  for (let i = -Math.floor((m.left / PX_PER_CM) * 4); ; i++) {
    const x = m.left + (i * PX_PER_CM) / 4;
    if (x > width) break;
    if (x < 0) continue;
    ticks.push({ x, kind: i % 4 === 0 ? 'cm' : i % 2 === 0 ? 'half' : 'q', n: i % 4 === 0 ? Math.abs(i / 4) : undefined });
  }
  const cm = (px: number) => `${(Math.round((px / PX_PER_CM) * 100) / 100).toString()} cm`;
  const tip = (text: string) => <i className="pg-handle-tip">{text}</i>;
  const marker = (part: 'left' | 'first' | 'right', x: number, label: string, value: number) => (
    <span
      key={part}
      className={'pg-ind ' + part + (drag?.k === 'indent' && drag.part === part ? ' dragging' : '')}
      style={{ left: x * k }}
      role="slider"
      tabIndex={canEdit ? 0 : -1}
      aria-label={label}
      aria-valuetext={cm(value)}
      aria-valuenow={Math.round((value / PX_PER_CM) * 100) / 100}
      aria-disabled={!canEdit || undefined}
      data-tip={drag ? undefined : `${label}: ${cm(value)}`}
      onPointerDown={startIndent(part)}
      onKeyDown={keyIndent(part)}
    >
      {drag?.k === 'indent' && drag.part === part && tip(cm(value))}
    </span>
  );
  return (
    <div className={'pg-ruler' + (canEdit ? ' can-edit' : '')} ref={ref} style={{ width: width * k }} aria-label="Ruler" onPointerDown={addTab} data-tip={canEdit && onTabs && !drag ? 'Click to add a tab stop' : undefined}>
      <span className="pg-ruler-off" style={{ left: 0, width: m.left * k }} />
      <span className="pg-ruler-off" style={{ right: 0, width: m.right * k }} />
      {ticks.filter((t) => k >= 0.7 || t.kind !== 'q').map((t, i) => (
        <span key={i} className={'pg-tick ' + t.kind} style={{ left: t.x * k }}>{t.n && (k >= 0.6 || t.n % 2 === 0) ? <b>{t.n}</b> : null}</span>
      ))}
      {(['left', 'right'] as const).map((side) => (
        <span
          key={side}
          className={'pg-edge ' + side + (drag?.k === 'margin' && drag.side === side ? ' dragging' : '')}
          style={{ left: (side === 'left' ? m.left : width - m.right) * k }}
          role="slider"
          tabIndex={canEdit ? 0 : -1}
          aria-label={side === 'left' ? 'Left margin' : 'Right margin'}
          aria-valuenow={Math.round((m[side] / PX_PER_CM) * 100) / 100}
          aria-valuetext={cm(m[side])}
          aria-valuemin={0}
          aria-disabled={!canEdit || undefined}
          data-tip={drag ? undefined : `${side === 'left' ? 'Left' : 'Right'} margin: ${cm(m[side])}`}
          onPointerDown={startMargin(side)}
          onKeyDown={keyMargin(side)}
        >
          {drag?.k === 'margin' && drag.side === side && tip(cm(m[side]))}
        </span>
      ))}
      {shownTabs.map((t) => (
        <span key={'t' + t} className={'pg-tab' + (drag?.k === 'tab' && drag.at === t ? ' dragging' : '')} style={{ left: (m.left + t) * k }} aria-hidden="true"
          data-tip={drag ? undefined : `Tab stop at ${cm(t)}. Drag it off the ruler to remove it`}
          onPointerDown={startTab(t)}
          onDoubleClick={(e) => { e.stopPropagation(); onTabs?.(sorted.filter((x) => x !== t)); }}
        >
          {drag?.k === 'tab' && drag.at === t && tip(cm(t))}
        </span>
      ))}
      {ind && (
        <>
          {marker('first', m.left + ind.left + ind.first, 'First line indent', ind.left + ind.first)}
          {marker('left', m.left + ind.left, 'Left indent', ind.left)}
          {marker('right', width - m.right - ind.right, 'Right indent', ind.right)}
        </>
      )}
    </div>
  );
}

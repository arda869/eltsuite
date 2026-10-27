import { NSelect } from '../components/Select';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Grip } from './nodes';
import { newId } from '../lib/tasks';

// A timeline for teaching tenses: a line from the past to the future with NOW on it, and
// marks on it: a single event (×), a point, an action in progress (a wavy line), a period
// (a bracket), repeated actions, an arrow from one time to another, and "?" for what is
// not sure. Each mark can have a label. Ready-made timelines for the common tenses.

export type TlKind = 'event' | 'point' | 'wave' | 'period' | 'repeat' | 'arrow' | 'question';
export type TlItem = { id: string; kind: TlKind; x: number; x2?: number; label?: string; side?: 'above' | 'below'; color?: string; count?: number };
export type TlAttrs = { id: string; title: string; sentence: string; now: number; showNow: boolean; ends: boolean; items: TlItem[] };

const W = 1000;
const H = 230;
const Y = 120; // the line
const COLORS = ['accent', '#2b2a28', '#3d6fb6', '#7a5cb8', '#c7772f'];
const col = (c?: string) => (!c || c === 'accent' ? 'var(--tl-accent, #d98f63)' : c);
export const KINDS: { k: TlKind; label: string; tip: string }[] = [
  { k: 'event', label: '×  Event', tip: 'A finished action at one time' },
  { k: 'point', label: '●  Point', tip: 'A moment' },
  { k: 'wave', label: '〰  In progress', tip: 'An action in progress' },
  { k: 'period', label: '⌐¬  Period', tip: 'A length of time: for, since, from … to' },
  { k: 'repeat', label: '× × ×  Repeated', tip: 'Repeated actions, habits' },
  { k: 'arrow', label: '↷  Arrow', tip: 'From one time to another' },
  { k: 'question', label: '?  Not sure', tip: 'Not certain: maybe, might' },
];
const two = (k: TlKind) => k === 'wave' || k === 'period' || k === 'repeat' || k === 'arrow';

type Preset = { k: string; label: string; title: string; sentence: string; items: Omit<TlItem, 'id'>[] };
const PRESETS: Preset[] = [
  { k: 'ps', label: 'Past simple', title: 'Past simple', sentence: 'I visited Rome last year.', items: [{ kind: 'event', x: 330, label: 'last year' }] },
  { k: 'pc', label: 'Past continuous', title: 'Past continuous', sentence: 'I was cooking when the phone rang.', items: [{ kind: 'wave', x: 220, x2: 450, label: 'was cooking' }, { kind: 'event', x: 360, label: 'the phone rang', side: 'below' }] },
  { k: 'pp', label: 'Present perfect', title: 'Present perfect', sentence: 'I have been to Japan.', items: [{ kind: 'event', x: 300, label: 'some time before now' }, { kind: 'arrow', x: 300, x2: 600, label: 'still matters now', side: 'below' }] },
  { k: 'ppc', label: 'Present perfect continuous', title: 'Present perfect continuous', sentence: 'I have been studying for two hours.', items: [{ kind: 'wave', x: 380, x2: 600, label: 'for two hours' }, { kind: 'period', x: 380, x2: 600, label: 'since 4 pm', side: 'below' }] },
  { k: 'pf', label: 'Past perfect', title: 'Past perfect', sentence: 'The film had started when we arrived.', items: [{ kind: 'event', x: 220, label: 'had started' }, { kind: 'event', x: 400, label: 'we arrived', color: '#3d6fb6' }, { kind: 'arrow', x: 220, x2: 400, side: 'below', label: 'first … then' }] },
  { k: 'used', label: 'Used to', title: 'Used to', sentence: 'I used to play the piano.', items: [{ kind: 'repeat', x: 150, x2: 430, count: 5, label: 'a habit then' }, { kind: 'question', x: 520, label: 'not now', side: 'below' }] },
  { k: 'pres', label: 'Present simple', title: 'Present simple', sentence: 'I go to work by bus.', items: [{ kind: 'repeat', x: 300, x2: 900, count: 7, label: 'every day' }] },
  { k: 'cont', label: 'Present continuous', title: 'Present continuous', sentence: 'I am reading a book.', items: [{ kind: 'wave', x: 520, x2: 690, label: 'right now' }] },
  { k: 'will', label: 'Future: will', title: 'Future: will', sentence: 'It will rain tomorrow.', items: [{ kind: 'event', x: 800, label: 'tomorrow' }] },
  { k: 'going', label: 'Future: going to', title: 'Future: going to', sentence: 'Look at the clouds! It’s going to rain.', items: [{ kind: 'arrow', x: 600, x2: 790, label: 'I can see it coming' }, { kind: 'event', x: 790, label: 'rain', side: 'below' }] },
  { k: 'might', label: 'Might / may', title: 'Might', sentence: 'I might go to the party.', items: [{ kind: 'question', x: 780, label: 'maybe' }] },
  { k: 'fp', label: 'Future perfect', title: 'Future perfect', sentence: 'By June, I will have finished.', items: [{ kind: 'event', x: 760, label: 'finished' }, { kind: 'point', x: 880, label: 'June', color: '#3d6fb6' }] },
];
export const newTimeline = () => ({ type: 'timeline', attrs: { id: newId(), title: '', sentence: '', now: 600, showNow: true, ends: true, items: [] } });

function wave(x1: number, x2: number, y: number) {
  const n = Math.max(2, Math.round((x2 - x1) / 22));
  const step = (x2 - x1) / n;
  let d = `M${x1} ${y}`;
  for (let i = 0; i < n; i++) d += ` q${step / 4} ${i % 2 ? 7 : -7} ${step / 2} 0 t${step / 2} 0`;
  return d;
}

// The drawing, for the editor, for learners, and for print.
export function TimelineSvg({ a, sel, onDown, editing }: { a: TlAttrs; sel?: string | null; onDown?: (e: React.PointerEvent, id: string, part: 'x' | 'x2' | 'now') => void; editing?: boolean }) {
  const items = a.items ?? [];
  const lbl = (x: number, side: string | undefined, text: string | undefined, c: string, offset = 0) =>
    text ? (
      <text x={x} y={side === 'below' ? Y + 48 + offset : Y - 38 - offset} textAnchor="middle" className="tl-label" fill={c}>
        {text}
      </text>
    ) : null;
  return (
    <svg className="tl-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={a.title || 'Timeline'}>
      <defs>
        <marker id={`tl-ah-${a.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="currentColor" />
        </marker>
      </defs>
      {/* the line */}
      <line x1={30} y1={Y} x2={W - 30} y2={Y} className="tl-line" markerStart={a.ends ? `url(#tl-ah-${a.id})` : undefined} markerEnd={`url(#tl-ah-${a.id})`} />
      {a.ends && (
        <>
          <text x={34} y={Y + 30} className="tl-end">PAST</text>
          <text x={W - 34} y={Y + 30} className="tl-end" textAnchor="end">FUTURE</text>
        </>
      )}
      {a.showNow && (
        <g className={'tl-now' + (editing ? ' can' : '')} onPointerDown={onDown ? (e) => onDown(e, '', 'now') : undefined}>
          <line x1={a.now} y1={Y - 26} x2={a.now} y2={Y + 26} />
          <text x={a.now} y={Y + 44} textAnchor="middle">NOW</text>
          {editing && <rect x={a.now - 12} y={Y - 30} width={24} height={80} fill="transparent" />}
        </g>
      )}
      {items.map((it) => {
        const c = col(it.color);
        const on = sel === it.id;
        const x2 = it.x2 ?? it.x + 150;
        const hit = (x: number, part: 'x' | 'x2') => (editing ? <circle cx={x} cy={Y} r={on ? 11 : 15} className={'tl-hit' + (on ? ' on' : '')} onPointerDown={(e) => onDown?.(e, it.id, part)} /> : null);
        let shape: React.ReactNode = null;
        if (it.kind === 'event')
          shape = (
            <g stroke={c} strokeWidth="4" strokeLinecap="round">
              <path d={`M${it.x - 10} ${Y - 10}L${it.x + 10} ${Y + 10}M${it.x + 10} ${Y - 10}L${it.x - 10} ${Y + 10}`} />
            </g>
          );
        else if (it.kind === 'point') shape = <circle cx={it.x} cy={Y} r={8} fill={c} />;
        else if (it.kind === 'question')
          shape = (
            <text x={it.x} y={Y + 10} textAnchor="middle" className="tl-q" fill={c}>
              ?
            </text>
          );
        else if (it.kind === 'wave') shape = <path d={wave(Math.min(it.x, x2), Math.max(it.x, x2), Y - 14)} fill="none" stroke={c} strokeWidth="3.5" strokeLinecap="round" />;
        else if (it.kind === 'period') {
          const yy = it.side === 'below' ? Y + 16 : Y - 16;
          const t = it.side === 'below' ? -8 : 8;
          shape = <path d={`M${it.x} ${yy + t}V${yy}H${x2}V${yy + t}`} fill="none" stroke={c} strokeWidth="3" strokeLinejoin="round" />;
        } else if (it.kind === 'repeat') {
          const n = Math.max(2, it.count ?? 5);
          shape = (
            <g stroke={c} strokeWidth="3.5" strokeLinecap="round">
              {Array.from({ length: n }, (_, i) => {
                const x = it.x + ((x2 - it.x) * i) / (n - 1);
                return <path key={i} d={`M${x - 8} ${Y - 8}L${x + 8} ${Y + 8}M${x + 8} ${Y - 8}L${x - 8} ${Y + 8}`} />;
              })}
            </g>
          );
        } else if (it.kind === 'arrow') {
          const up = it.side !== 'below';
          const mid = (it.x + x2) / 2;
          const cy = up ? Y - 70 : Y + 70;
          shape = (
            <>
              <defs>
                <marker id={`tl-ah-${a.id}-${it.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" fill={c} />
                </marker>
              </defs>
              <path d={`M${it.x} ${up ? Y - 14 : Y + 14}Q${mid} ${cy} ${x2} ${up ? Y - 14 : Y + 14}`} fill="none" stroke={c} strokeWidth="3" markerEnd={`url(#tl-ah-${a.id}-${it.id})`} />
            </>
          );
        }
        const lx = two(it.kind) ? (it.x + x2) / 2 : it.x;
        const off = it.kind === 'arrow' ? 22 : it.kind === 'wave' && it.side !== 'below' ? 6 : 0;
        return (
          <g key={it.id} className={'tl-item' + (on ? ' on' : '')} style={{ color: c }}>
            {shape}
            {lbl(lx, it.side, it.label, c, off)}
            {hit(it.x, 'x')}
            {two(it.kind) && hit(x2, 'x2')}
          </g>
        );
      })}
    </svg>
  );
}

export const timelineSvgString = (a: TlAttrs, accent = '#d98f63') => renderToStaticMarkup(<TimelineSvg a={a} />).replace(/var\(--tl-accent, #d98f63\)/g, accent);

export function TimelineFigure({ a }: { a: TlAttrs }) {
  return (
    <figure className="tl">
      {a.title && <figcaption className="tl-title">{a.title}</figcaption>}
      <TimelineSvg a={a} />
      {a.sentence && <p className="tl-sentence">{a.sentence}</p>}
    </figure>
  );
}

function TimelineView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const a = node.attrs as TlAttrs;
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<TlAttrs | null>(null);
  const svgWrap = useRef<HTMLDivElement>(null);
  const cur = drag ?? a;
  const it = cur.items.find((x) => x.id === sel);
  const setItems = (items: TlItem[]) => updateAttributes({ items });
  const patch = (p: Partial<TlItem>) => it && setItems(cur.items.map((x) => (x.id === it.id ? { ...x, ...p } : x)));
  const add = (k: TlKind) => {
    const x = Math.max(80, Math.min(W - 120, cur.now - 160 + ((cur.items.length * 70) % 320)));
    const item: TlItem = { id: newId(), kind: k, x, ...(two(k) ? { x2: Math.min(W - 60, x + 180) } : {}), ...(k === 'repeat' ? { count: 5 } : {}), label: '', side: 'above', color: 'accent' };
    setItems([...cur.items, item]);
    setSel(item.id);
  };
  const toX = (e: { clientX: number }) => {
    const svg = svgWrap.current?.querySelector('svg');
    const r = svg?.getBoundingClientRect();
    if (!r) return 0;
    return Math.round(Math.max(36, Math.min(W - 36, ((e.clientX - r.left) / r.width) * W)) / 5) * 5;
  };
  const onDown = (e: React.PointerEvent, id: string, part: 'x' | 'x2' | 'now') => {
    e.preventDefault();
    e.stopPropagation();
    if (id) setSel(id);
    let latest = a;
    const mv = (ev: PointerEvent) => {
      const x = toX(ev);
      latest = part === 'now' ? { ...a, now: x } : { ...a, items: a.items.map((t) => (t.id === id ? { ...t, [part]: x } : t)) };
      setDrag(latest);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (latest !== a) updateAttributes(part === 'now' ? { now: latest.now } : { items: latest.items });
      setDrag(null);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const stop = (e: React.KeyboardEvent) => e.stopPropagation();
  return (
    <NodeViewWrapper className={'block-node tl-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">Timeline</span>
        <NSelect className="tl-preset" value="" onChange={(e) => {
          const p = PRESETS.find((x) => x.k === e.target.value);
          if (p) (updateAttributes({ title: p.title, sentence: p.sentence, now: 600, items: p.items.map((x) => ({ ...x, id: newId(), side: x.side ?? 'above', color: x.color ?? 'accent' })) }), setSel(null));
        }} aria-label="Start from a tense">
          <option value="">Start from a tense…</option>
          {PRESETS.map((p) => (
            <option key={p.k} value={p.k}>
              {p.label}
            </option>
          ))}
        </NSelect>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <input aria-label="Title, for example: Present perfect" className="tl-title-in" value={a.title} placeholder="Title, for example: Present perfect" onChange={(e) => updateAttributes({ title: e.target.value })} onKeyDown={stop} />
      <div className="tl-add" role="toolbar" aria-label="Add to the timeline">
        {KINDS.map((k) => (
          <button key={k.k} type="button" className="ap-chip" data-tip={k.tip} onClick={() => add(k.k)}>
            {k.label}
          </button>
        ))}
        <label className="check-row tl-opt">
          <input type="checkbox" checked={a.showNow} onChange={(e) => updateAttributes({ showNow: e.target.checked })} /> NOW
        </label>
        <label className="check-row tl-opt">
          <input type="checkbox" checked={a.ends} onChange={(e) => updateAttributes({ ends: e.target.checked })} /> Past and future
        </label>
      </div>
      <div className="tl-canvas" ref={svgWrap} onPointerDown={(e) => (e.target as Element).tagName === 'svg' && setSel(null)}>
        <TimelineSvg a={cur} sel={sel} onDown={onDown} editing />
      </div>
      {it ? (
        <div className="tl-edit">
          <input aria-label="Label, for example: last year" autoFocus value={it.label ?? ''} placeholder="Label, for example: last year" onChange={(e) => patch({ label: e.target.value })} onKeyDown={stop} />
          <span className="seg small-seg">
            {(['above', 'below'] as const).map((s) => (
              <button key={s} type="button" className={(it.side ?? 'above') === s ? 'on' : ''} onClick={() => patch({ side: s })}>
                {s === 'above' ? 'Above' : 'Below'}
              </button>
            ))}
          </span>
          {it.kind === 'repeat' && (
            <label className="tl-count">
              Times
              <input type="number" min={2} max={12} value={it.count ?? 5} onChange={(e) => patch({ count: Math.max(2, Math.min(12, Number(e.target.value) || 2)) })} onKeyDown={stop} />
            </label>
          )}
          <span className="tl-colors">
            {COLORS.map((c) => (
              <button key={c} type="button" className={'sl-fill' + ((it.color ?? 'accent') === c ? ' on' : '')} style={{ background: col(c) }} aria-label="Colour" onClick={() => patch({ color: c })} />
            ))}
          </span>
          <button type="button" className="btn link small" onClick={() => (setItems(cur.items.filter((x) => x.id !== it.id)), setSel(null))}>
            Delete
          </button>
        </div>
      ) : (
        <span className="hint tl-hint">{cur.items.length ? 'Click a mark to label it; drag it, or the ends of a line, along the timeline. Drag NOW to move it.' : 'Add marks above, or start from a tense.'}</span>
      )}
      <input aria-label="Example sentence, for example: I have been to Japan." className="tl-sentence-in" value={a.sentence} placeholder="Example sentence, for example: I have been to Japan." onChange={(e) => updateAttributes({ sentence: e.target.value })} onKeyDown={stop} />
    </NodeViewWrapper>
  );
}

export const TimelineNode = Node.create({
  name: 'timeline',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: '' },
    title: { default: '' },
    sentence: { default: '' },
    now: { default: 600 },
    showNow: { default: true },
    ends: { default: true },
    items: { default: [] },
  }),
  parseHTML: () => [{ tag: 'div[data-timeline]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-timeline': '' })],
  addNodeView: () => ReactNodeViewRenderer(TimelineView),
});

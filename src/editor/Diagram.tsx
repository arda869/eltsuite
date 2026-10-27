import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { JSONContent } from '@tiptap/react';
import { newId } from '../lib/tasks';
import { Select } from '../components/Select';

// Diagrams teachers draw on the board: a mind map, a Venn diagram, a T-chart, a cline, a flow
// chart, a cycle, a tree, four squares and a pyramid. Every box is ordinary text, so it can hold
// anything a task can: words, IPA, a gap, a choice. The lines and arrows are drawn around the
// boxes wherever they end up, in the editor, for learners and on paper.

export type DgKind = 'mind' | 'venn' | 'compare' | 'cline' | 'flow' | 'cycle' | 'tree' | 'quad' | 'pyramid';
export type DgAttrs = { id: string; kind: DgKind; title: string; labels: string[] };

type Spec = { label: string; hint: string; min: number; max: number; add?: string; cellLabel?: (i: number, n: number) => string | null; ends?: string[] };
export const DG: Record<DgKind, Spec> = {
  mind: { label: 'Mind map', hint: 'A word or topic in the middle with ideas around it: vocabulary, brainstorming, planning', min: 3, max: 9, add: 'branch' },
  venn: { label: 'Venn diagram', hint: 'Two circles: what is only in one, and what they share', min: 3, max: 3, cellLabel: (i) => (i === 0 ? 'First circle' : i === 1 ? 'Both' : 'Second circle') },
  compare: { label: 'T-chart', hint: 'Columns side by side: pros and cons, formal and informal, then and now', min: 2, max: 4, add: 'column', cellLabel: () => 'Column title' },
  cline: { label: 'Cline', hint: 'A scale from one end to the other: always … never, certain … impossible, hot … freezing', min: 3, max: 8, add: 'point', ends: ['One end', 'The other end'] },
  flow: { label: 'Flow chart', hint: 'Steps in order with arrows: a process, a story, instructions, a sentence pattern', min: 2, max: 8, add: 'step' },
  cycle: { label: 'Cycle', hint: 'Steps that come round again: life cycles, daily routines, the water cycle', min: 3, max: 6, add: 'step' },
  tree: { label: 'Tree', hint: 'One word or idea at the top and its branches: word families, categories, a family tree', min: 3, max: 7, add: 'branch' },
  quad: { label: 'Four squares', hint: 'Two lines across each other: formal or informal, spoken or written, likely or unlikely', min: 4, max: 4, ends: ['Top', 'Bottom', 'Left', 'Right'] },
  pyramid: { label: 'Pyramid', hint: 'Levels from the top down: a ranking, from word to text, most to least important', min: 3, max: 5, add: 'level' },
};
export const DG_KINDS = Object.keys(DG) as DgKind[];

// ------------------------------------------------------------------ new diagrams, with an example
const p = (t: string): JSONContent => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : undefined });
const cell = (t: string, label = ''): JSONContent => ({ type: 'diagramCell', attrs: { label }, content: [p(t)] });
const EXAMPLES: Record<DgKind, { labels: string[]; cells: [string, string?][] }> = {
  mind: { labels: [], cells: [['Holidays'], ['places to stay'], ['transport'], ['things to do'], ['food']] },
  venn: { labels: [], cells: [['bark, need walks', 'Dogs'], ['pets, four legs', 'Both'], ['purr, climb', 'Cats']] },
  compare: { labels: [], cells: [['Could you…? I would like…', 'Formal'], ['Can you…? I want…', 'Informal']] },
  cline: { labels: ['100%', '0%'], cells: [['always'], ['usually'], ['often'], ['sometimes'], ['never']] },
  flow: { labels: [], cells: [['Wake up'], ['Have breakfast'], ['Go to school'], ['Start lessons']] },
  cycle: { labels: [], cells: [['egg'], ['caterpillar'], ['chrysalis'], ['butterfly']] },
  tree: { labels: [], cells: [['act'], ['action'], ['actor'], ['active']] },
  quad: { labels: ['Formal', 'Informal', 'Spoken', 'Written'], cells: [['Good morning, everyone.'], ['Dear Sir or Madam,'], ['Hi! How’s it going?'], ['Hey, see you later x']] },
  pyramid: { labels: [], cells: [['word'], ['phrase'], ['sentence'], ['paragraph']] },
};
export const newDiagram = (kind: DgKind): JSONContent => {
  const ex = EXAMPLES[kind];
  return { type: 'diagram', attrs: { id: newId(), kind, title: '', labels: ex.labels }, content: ex.cells.map(([t, l]) => cell(t, l ?? '')) };
};

// ------------------------------------------------------------------ the lines and arrows
type R = { x: number; y: number; w: number; h: number };
const mid = (r: R) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
// Where the line from the middle of a box towards a point leaves the box.
function edge(r: R, to: { x: number; y: number }, gap = 5) {
  const c = mid(r);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (!dx && !dy) return c;
  const s = Math.min(dx ? (r.w / 2 + gap) / Math.abs(dx) : Infinity, dy ? (r.h / 2 + gap) / Math.abs(dy) : Infinity);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

// Grid places (row, column) for the boxes around the middle, clockwise from the top.
const RING: Record<string, [number, number]> = { T: [1, 2], TR: [1, 3], R: [2, 3], BR: [3, 3], B: [3, 2], BL: [3, 1], L: [2, 1], TL: [1, 1] };
const MIND_ORDER = ['L', 'R', 'T', 'B', 'TL', 'TR', 'BR', 'BL'];
const CYCLE_ORDER: Record<number, string[]> = { 3: ['T', 'BR', 'BL'], 4: ['T', 'R', 'B', 'L'], 5: ['T', 'R', 'BR', 'BL', 'L'], 6: ['TL', 'TR', 'R', 'BR', 'BL', 'L'] };
function placeOf(kind: DgKind, i: number, n: number): React.CSSProperties | undefined {
  if (kind === 'mind') {
    if (i === 0) return { gridRow: 2, gridColumn: 2 };
    const [r, c] = RING[MIND_ORDER[(i - 1) % 8]];
    return { gridRow: r, gridColumn: c };
  }
  if (kind === 'cycle') {
    const [r, c] = RING[(CYCLE_ORDER[n] ?? CYCLE_ORDER[6])[i % 6]];
    return { gridRow: r, gridColumn: c };
  }
  if (kind === 'tree') return i === 0 ? { gridRow: 1, gridColumn: '1 / -1', justifySelf: 'center' } : { gridRow: 2 };
  return undefined;
}

// The boxes of one diagram, wherever they are on the page, relative to its stage.
function boxesOf(stage: HTMLElement) {
  const sr = stage.getBoundingClientRect();
  const z = sr.width ? stage.offsetWidth / sr.width : 1;
  return (Array.from(stage.querySelectorAll('.dg-cell')) as HTMLElement[])
    .filter((el) => el.closest('.dg-stage') === stage)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { el, r: { x: (r.left - sr.left) * z, y: (r.top - sr.top) * z, w: r.width * z, h: r.height * z } };
    });
}

function Lines({ kind, id, stage, n }: { kind: DgKind; id: string; stage: React.RefObject<HTMLDivElement>; n: number }) {
  const [shape, setShape] = useState<{ w: number; h: number; d: ReactNode } | null>(null);
  useLayoutEffect(() => {
    const st = stage.current;
    if (!st) return;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const W = st.offsetWidth;
      const H = st.offsetHeight;
      const bx = boxesOf(st);
      const rs = bx.map((b) => b.r);
      const line = { stroke: 'var(--dg-ink)', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
      const arrow = { ...line, markerEnd: `url(#dg-a-${id})` };
      const out: ReactNode[] = [];
      if (kind === 'mind' && rs.length > 1) {
        const c = mid(rs[0]);
        rs.slice(1).forEach((r, i) => {
          const a = edge(rs[0], mid(r), 2);
          const b = edge(r, c, 2);
          out.push(<path key={i} d={`M${a.x} ${a.y} Q${(a.x + b.x) / 2 + (b.y - a.y) * 0.12} ${(a.y + b.y) / 2 - (b.x - a.x) * 0.12} ${b.x} ${b.y}`} {...line} />);
        });
      } else if (kind === 'flow') {
        for (let i = 0; i < rs.length - 1; i++) {
          const a = edge(rs[i], mid(rs[i + 1]));
          const b = edge(rs[i + 1], mid(rs[i]), 8);
          out.push(<path key={i} d={`M${a.x} ${a.y} L${b.x} ${b.y}`} {...arrow} />);
        }
      } else if (kind === 'cycle' && rs.length > 2) {
        const cx = W / 2;
        const cy = H / 2;
        rs.forEach((r, i) => {
          const s = rs[(i + 1) % rs.length];
          const a = edge(r, mid(s));
          const b = edge(s, mid(r), 8);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const ox = mx - cx;
          const oy = my - cy;
          const len = Math.hypot(ox, oy) || 1;
          const bend = Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.22);
          out.push(<path key={i} d={`M${a.x} ${a.y} Q${mx + (ox / len) * bend} ${my + (oy / len) * bend} ${b.x} ${b.y}`} {...arrow} />);
        });
      } else if (kind === 'tree' && rs.length > 1) {
        const root = rs[0];
        const top = Math.min(...rs.slice(1).map((r) => r.y));
        const ym = (root.y + root.h + top) / 2;
        const x0 = root.x + root.w / 2;
        out.push(<path key="stem" d={`M${x0} ${root.y + root.h + 3} V${ym}`} {...line} />);
        rs.slice(1).forEach((r, i) => out.push(<path key={i} d={`M${x0} ${ym} H${r.x + r.w / 2} V${r.y - 6}`} {...arrow} />));
      } else if (kind === 'venn') {
        out.push(
          <ellipse key="a" cx={W * 0.35} cy={H / 2} rx={W * 0.33} ry={Math.max(1, H / 2 - 2)} className="dg-ring a" />,
          <ellipse key="b" cx={W * 0.65} cy={H / 2} rx={W * 0.33} ry={Math.max(1, H / 2 - 2)} className="dg-ring b" />,
        );
      } else if (kind === 'cline' && rs.length > 1) {
        const ends = Array.from(st.querySelectorAll(':scope > .dg-end')) as HTMLElement[];
        const y = 16;
        const x1 = ends[0] ? ends[0].offsetLeft + ends[0].offsetWidth + 10 : 8;
        const x2 = ends[1] ? ends[1].offsetLeft - 10 : W - 8;
        out.push(<path key="l" d={`M${x1} ${y} H${x2}`} {...line} markerStart={`url(#dg-s-${id})`} markerEnd={`url(#dg-a-${id})`} />);
        rs.forEach((r, i) => {
          const x = r.x + r.w / 2;
          out.push(<path key={'t' + i} d={`M${x} ${y - 7} V${y + 7}`} {...line} />, <path key={'d' + i} d={`M${x} ${y + 11} V${r.y - 4}`} {...line} strokeDasharray="2 4" strokeWidth={1.5} />);
        });
      } else if (kind === 'pyramid' && rs.length) {
        // One triangle, cut into a band for each level; each box as wide as its band.
        const top = rs[0].y;
        const bottom = rs[rs.length - 1].y + rs[rs.length - 1].h;
        const lead = (bottom - top) * 0.35;
        const half = (y: number) => (W / 2) * ((y - top + lead) / (bottom - top + lead));
        rs.forEach((r, i) => {
          const y1 = i ? (rs[i - 1].y + rs[i - 1].h + r.y) / 2 : top;
          const y2 = i < rs.length - 1 ? (r.y + r.h + rs[i + 1].y) / 2 : bottom;
          const a = half(y1);
          const b = half(y2);
          out.push(<polygon key={i} points={`${W / 2 - a},${y1} ${W / 2 + a},${y1} ${W / 2 + b},${y2} ${W / 2 - b},${y2}`} className={'dg-band b' + (i % 3)} />);
          const want = `${Math.max(90, (half((y1 + y2) / 2) * 2 - 24))}px`;
          if (bx[i].el.style.maxWidth !== want) bx[i].el.style.maxWidth = want;
        });
      }
      setShape({ w: W, h: H, d: out });
    };
    const later = () => (raf ||= requestAnimationFrame(draw));
    const ro = new ResizeObserver(later);
    ro.observe(st);
    boxesOf(st).forEach((b) => ro.observe(b.el));
    const mo = new MutationObserver(later);
    mo.observe(st, { childList: true, subtree: true, characterData: true });
    later();
    return () => (ro.disconnect(), mo.disconnect(), cancelAnimationFrame(raf));
  }, [kind, id, stage, n]);
  if (!shape) return null;
  return (
    <svg className="dg-lines" width={shape.w} height={shape.h} viewBox={`0 0 ${shape.w} ${shape.h}`}  aria-hidden="true">
      <defs>
        <marker id={`dg-a-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke="var(--dg-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        <marker id={`dg-s-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke="var(--dg-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {shape.d}
    </svg>
  );
}

// The diagram itself, the same for the editor and for learners. The boxes are its children.
export function DiagramFrame({ a, n, children, endLabel, head }: { a: DgAttrs; n: number; children: ReactNode; endLabel?: (i: number) => ReactNode; head?: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const kind = (DG[a.kind] ? a.kind : 'mind') as DgKind;
  const spec = DG[kind];
  const ends = spec.ends ?? [];
  const lab = (i: number) => endLabel?.(i) ?? (a.labels?.[i] ? <span>{a.labels[i]}</span> : null);
  return (
    <figure className={'dg k-' + kind} data-n={n} style={{ ['--dg-n' as string]: Math.max(1, n - (kind === 'tree' ? 1 : 0)) }}>
      {head}
      {a.title && !head && <figcaption className="dg-title">{a.title}</figcaption>}
      <div className={'dg-stage' + (kind === 'quad' ? ' has-axes' : '')} ref={stage}>
        <Lines kind={kind} id={a.id || 'x'} stage={stage} n={n} />
        {kind === 'cline' && ends.map((_, i) => (
          <span key={i} className={'dg-end e' + i} contentEditable={false}>
            {lab(i)}
          </span>
        ))}
        {kind === 'quad' && ends.map((_, i) => (
          <span key={i} className={'dg-axis x' + i} contentEditable={false}>
            {lab(i)}
          </span>
        ))}
        {children}
      </div>
    </figure>
  );
}
export const cellStyle = placeOf;

// ------------------------------------------------------------------ in the editor
function DiagramView({ node, updateAttributes, editor, getPos, deleteNode, selected }: NodeViewProps) {
  const a = node.attrs as DgAttrs;
  const kind = (DG[a.kind] ? a.kind : 'mind') as DgKind;
  const spec = DG[kind];
  const n = node.childCount;
  const editable = editor.isEditable;
  const add = () => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos == null || n >= spec.max) return;
    const c = editor.schema.nodeFromJSON(cell(''));
    editor.view.dispatch(editor.state.tr.insert(pos + node.nodeSize - 1, c));
  };
  // Another kind keeps what is written; boxes are added when the new kind needs more.
  const change = (k: DgKind) => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos == null) return;
    let tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...a, kind: k, labels: a.labels?.length ? a.labels : EXAMPLES[k].labels });
    const end = pos + node.nodeSize - 1;
    for (let i = n; i < DG[k].min; i++) tr = tr.insert(end, editor.schema.nodeFromJSON(cell('')));
    editor.view.dispatch(tr);
  };
  const setLabel = (i: number, v: string) => {
    const labels = [...(a.labels ?? [])];
    while (labels.length <= i) labels.push('');
    labels[i] = v;
    updateAttributes({ labels });
  };
  const endLabel = editable ? (i: number) => <input className="dg-end-in" value={a.labels?.[i] ?? ''} placeholder={spec.ends?.[i] ?? ''} onChange={(e) => setLabel(i, e.target.value)} size={Math.max(4, (a.labels?.[i] ?? spec.ends?.[i] ?? '').length + 1)} /> : undefined;
  return (
    <NodeViewWrapper className={'dg-node' + (selected ? ' is-selected' : '')} data-diagram="">
      <DiagramFrame
        a={a}
        n={n}
        endLabel={endLabel}
        head={
          <div className="dg-ed-head" contentEditable={false}>
            <Select value={kind} options={DG_KINDS.filter((k) => DG[k].max >= n).map((k) => ({ v: k, label: DG[k].label, hint: DG[k].hint }))} onChange={(v) => change(v)} label="Kind of diagram" disabled={!editable} />
            <input className="dg-title-in" value={a.title ?? ''} placeholder="Title (optional)" onChange={(e) => updateAttributes({ title: e.target.value })} readOnly={!editable} />
            <span style={{ flex: 1 }} />
            {editable && spec.add && n < spec.max && (
              <button type="button" className="btn small-btn" onClick={add}>
                + Add a {spec.add}
              </button>
            )}
            {editable && (
              <button type="button" className="btn link small" onClick={deleteNode}>
                Remove
              </button>
            )}
          </div>
        }
      >
        <NodeViewContent className="dg-cells" />
      </DiagramFrame>
    </NodeViewWrapper>
  );
}

function CellView({ node, updateAttributes, editor, getPos, deleteNode }: NodeViewProps) {
  const pos = typeof getPos === 'function' ? getPos() : null;
  const $p = pos != null ? editor.state.doc.resolve(pos) : null;
  const parent = $p?.parent;
  const kind = ((parent?.attrs.kind as DgKind) ?? 'mind') as DgKind;
  const spec = DG[kind] ?? DG.mind;
  const n = parent?.childCount ?? 1;
  const i = $p ? $p.index() : 0;
  const lab = spec.cellLabel?.(i, n) ?? null;
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper className={'dg-cell c' + i + (i === 0 && (kind === 'mind' || kind === 'tree') ? ' main' : '')} style={placeOf(kind, i, n)}>
      {lab !== null && (
        <input className="dg-cell-label" contentEditable={false} value={node.attrs.label ?? ''} placeholder={lab} onChange={(e) => updateAttributes({ label: e.target.value })} readOnly={!editable} />
      )}
      <NodeViewContent className="dg-cell-body" />
      {editable && spec.add && n > spec.min && !(i === 0 && (kind === 'mind' || kind === 'tree')) && (
        <button type="button" className="dg-cell-x" contentEditable={false} onClick={deleteNode} aria-label="Remove this box" data-tip="Remove this box">
          ×
        </button>
      )}
    </NodeViewWrapper>
  );
}

export const DiagramCell = Node.create({
  name: 'diagramCell',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes: () => ({ label: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? '', renderHTML: (x: { label: string }) => (x.label ? { 'data-label': x.label } : {}) } }),
  parseHTML: () => [{ tag: 'div[data-dg-cell]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-dg-cell': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(CellView),
});

export const DiagramNode = Node.create({
  name: 'diagram',
  group: 'block',
  content: 'diagramCell+',
  defining: true,
  isolating: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: null },
    kind: { default: 'mind', parseHTML: (el: HTMLElement) => el.getAttribute('data-kind') || 'mind', renderHTML: (x: { kind: string }) => ({ 'data-kind': x.kind }) },
    title: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-title') ?? '', renderHTML: (x: { title: string }) => (x.title ? { 'data-title': x.title } : {}) },
    labels: {
      default: [],
      parseHTML: (el: HTMLElement) => {
        try {
          return JSON.parse(el.getAttribute('data-labels') || '[]');
        } catch {
          return [];
        }
      },
      renderHTML: (x: { labels: string[] }) => (x.labels?.length ? { 'data-labels': JSON.stringify(x.labels) } : {}),
    },
  }),
  parseHTML: () => [{ tag: 'div[data-diagram]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-diagram': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(DiagramView),
});

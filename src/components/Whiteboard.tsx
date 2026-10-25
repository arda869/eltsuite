import { useEffect, useMemo, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { onValue, ref, remove, set } from 'firebase/database';
import { rtdb } from '../lib/firebase';

// A shared 16:9 board for a task. Strokes are stored in a 1600 × 900 space, so the board looks
// the same scaled to any screen. Strokes sync live through the Realtime Database and stay saved.

const W = 1600;
const H = 900;
type Tool = 'pen' | 'marker' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'eraser';
export type Stroke = { id: string; by: string; tool: Tool; color: string; size: number; pts: number[][]; text?: string; t: number };

// No red or green: those colours mean right and wrong answers.
const COLORS = ['#2f2e2d', '#2f5fa8', '#d98f63', '#8a857e', '#d9a13a', '#7a4a86'];
const TOOLS: { key: Tool; label: string; icon: string }[] = [
  { key: 'pen', label: 'Pen', icon: 'M4 20l4-1L19 8l-3-3L5 16z' },
  { key: 'marker', label: 'Highlighter', icon: 'M6 18l3 1 9-9-4-4-9 9zM14 4l6 6' },
  { key: 'line', label: 'Line', icon: 'M5 19L19 5' },
  { key: 'arrow', label: 'Arrow', icon: 'M5 19L19 5M11 5h8v8' },
  { key: 'rect', label: 'Rectangle', icon: 'M4 6h16v12H4z' },
  { key: 'ellipse', label: 'Ellipse', icon: 'M12 5c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7z' },
  { key: 'text', label: 'Text', icon: 'M5 6h14M12 6v13' },
  { key: 'eraser', label: 'Eraser', icon: 'M8 20h12M4 16l9-9 5 5-6 6H8z' },
];

function pathOf(points: number[][], size: number, marker: boolean) {
  const outline = getStroke(points, { size: marker ? size * 3.2 : size, thinning: marker ? 0 : 0.55, smoothing: 0.6, streamline: 0.5, simulatePressure: points.every((p) => p[2] === undefined || p[2] === 0.5) });
  if (!outline.length) return '';
  const d = outline.reduce((acc, [x0, y0], i, arr) => {
    const [x1, y1] = arr[(i + 1) % arr.length];
    acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    return acc;
  }, ['M', ...outline[0], 'Q'] as (string | number)[]);
  d.push('Z');
  return d.join(' ');
}

function Shape({ s }: { s: Stroke }) {
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
  if (!a || !b) return null;
  const common = { stroke: s.color, strokeWidth: s.size, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (s.tool === 'line') return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} />;
  if (s.tool === 'arrow') {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const L = 18 + s.size * 2;
    const p1 = [b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45)];
    const p2 = [b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)];
    return <path d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}M${p1[0]} ${p1[1]}L${b[0]} ${b[1]}L${p2[0]} ${p2[1]}`} {...common} />;
  }
  if (s.tool === 'rect') return <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} rx="6" {...common} />;
  if (s.tool === 'ellipse') return <ellipse cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} rx={Math.abs(b[0] - a[0]) / 2} ry={Math.abs(b[1] - a[1]) / 2} {...common} />;
  if (s.tool === 'text')
    return (
      <text x={a[0]} y={a[1]} fill={s.color} fontSize={s.size * 7} fontFamily="Kalam, cursive" dominantBaseline="hanging">
        {s.text}
      </text>
    );
  return <path d={pathOf(s.pts, s.size, s.tool === 'marker')} fill={s.color} opacity={s.tool === 'marker' ? 0.35 : 1} />;
}

const nearStroke = (s: Stroke, x: number, y: number) => s.pts.some((p, i) => {
  const q = s.pts[i + 1] ?? p;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(x - (p[0] + t * dx), y - (p[1] + t * dy)) < 18 + s.size;
}) || (s.tool === 'rect' || s.tool === 'ellipse' ? x >= Math.min(s.pts[0][0], s.pts[s.pts.length - 1][0]) - 10 && x <= Math.max(s.pts[0][0], s.pts[s.pts.length - 1][0]) + 10 && y >= Math.min(s.pts[0][1], s.pts[s.pts.length - 1][1]) - 10 && y <= Math.max(s.pts[0][1], s.pts[s.pts.length - 1][1]) + 10 : false);

export function Whiteboard({ classId, taskId, uid, teacher, people = [] }: { classId: string; taskId: string; uid: string; teacher: boolean; people?: { uid: string; name: string }[] }) {
  const base = `sessions/${classId}/board/${taskId}`;
  const [strokes, setStrokes] = useState<Record<string, Stroke>>({});
  const [pen, setPen] = useState<string>('teacher');
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(8);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [textVal, setTextVal] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const lastSend = useRef(0);

  useEffect(() => {
    const u1 = onValue(ref(rtdb, `${base}/strokes`), (s) => setStrokes(s.val() ?? {}), () => {});
    const u2 = onValue(ref(rtdb, `${base}/pen`), (s) => setPen(s.val() ?? 'teacher'), () => {});
    return () => (u1(), u2());
  }, [base]);

  const canDraw = teacher || pen === 'all' || pen === uid;
  const list = useMemo(() => Object.values(strokes).sort((a, b) => a.t - b.t), [strokes]);

  const at = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, e.pressure || 0.5];
  };
  const save = (s: Stroke) => set(ref(rtdb, `${base}/strokes/${s.id}`), s).catch(() => {});

  const down = (e: React.PointerEvent) => {
    if (!canDraw) return;
    const p = at(e);
    if (tool === 'eraser') {
      const hit = [...list].reverse().find((s) => (teacher || s.by === uid) && nearStroke(s, p[0], p[1]));
      if (hit) remove(ref(rtdb, `${base}/strokes/${hit.id}`)).catch(() => {});
      return;
    }
    if (tool === 'text') {
      setTextAt({ x: p[0], y: p[1] });
      setTextVal('');
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraft({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), by: uid, tool, color, size, pts: [p], t: Date.now() });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = at(e);
    const next = { ...draft, pts: ['pen', 'marker'].includes(draft.tool) ? [...draft.pts, p] : [draft.pts[0], p] };
    setDraft(next);
    if (Date.now() - lastSend.current > 80) {
      lastSend.current = Date.now();
      save(next);
    }
  };
  const up = () => {
    if (!draft) return;
    save(draft);
    setDraft(null);
  };
  const undo = () => {
    const mine = [...list].reverse().find((s) => s.by === uid);
    if (mine) remove(ref(rtdb, `${base}/strokes/${mine.id}`)).catch(() => {});
  };
  const clear = () => window.confirm('Clear the whole board for everyone?') && remove(ref(rtdb, `${base}/strokes`)).catch(() => {});
  const commitText = () => {
    if (textAt && textVal.trim()) save({ id: Date.now().toString(36), by: uid, tool: 'text', color, size, pts: [[textAt.x, textAt.y]], text: textVal.trim(), t: Date.now() });
    setTextAt(null);
  };

  const shown = draft ? [...list.filter((s) => s.id !== draft.id), draft] : list;
  return (
    <div className="wb">
      <div className="wb-bar" role="toolbar" aria-label="Board tools">
        {canDraw ? (
          <>
            {TOOLS.map((t) => (
              <button key={t.key} type="button" className={'wb-tool' + (tool === t.key ? ' on' : '')} title={t.label} aria-label={t.label} onClick={() => setTool(t.key)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
              </button>
            ))}
            <span className="wb-sep" />
            {COLORS.map((c) => (
              <button key={c} type="button" className={'wb-color' + (color === c ? ' on' : '')} style={{ background: c }} aria-label="Colour" onClick={() => setColor(c)} />
            ))}
            <span className="wb-sep" />
            {[4, 8, 16].map((s) => (
              <button key={s} type="button" className={'wb-size' + (size === s ? ' on' : '')} aria-label={`Size ${s}`} onClick={() => setSize(s)}>
                <span style={{ width: s / 1.6 + 3, height: s / 1.6 + 3 }} />
              </button>
            ))}
            <span className="wb-sep" />
            <button type="button" className="wb-tool" title="Undo" aria-label="Undo" onClick={undo}>
              ↶
            </button>
            {teacher && (
              <button type="button" className="wb-tool wide" onClick={clear}>
                Clear
              </button>
            )}
          </>
        ) : (
          <span className="hint">Your teacher is drawing. You can draw when your teacher gives you the pen.</span>
        )}
        {teacher && (
          <select className="wb-pen" value={pen} onChange={(e) => set(ref(rtdb, `${base}/pen`), e.target.value).catch(() => {})} aria-label="Who can draw">
            <option value="teacher">Only I draw</option>
            <option value="all">Everyone can draw</option>
            {people.map((p) => (
              <option key={p.uid} value={p.uid}>
                {p.name} draws
              </option>
            ))}
          </select>
        )}
        {!teacher && canDraw && <span className="wb-you">You have the pen</span>}
      </div>
      <div className="wb-frame">
        <svg ref={svg} className={'wb-canvas' + (canDraw ? ' can t-' + tool : '')} viewBox={`0 0 ${W} ${H}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
          <rect width={W} height={H} fill="#fff" />
          {shown.map((s) => (
            <Shape key={s.id} s={s} />
          ))}
        </svg>
        {textAt && (
          <input
            className="wb-text"
            autoFocus
            value={textVal}
            style={{ left: `${(textAt.x / W) * 100}%`, top: `${(textAt.y / H) * 100}%`, color }}
            onChange={(e) => setTextVal(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => (e.key === 'Enter' ? commitText() : e.key === 'Escape' && setTextAt(null))}
          />
        )}
      </div>
    </div>
  );
}

import { NSelect } from './Select';
import { zoomOf } from '../lib/zoom';
import { ask } from '../lib/ask';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { onDisconnect, onValue, ref, remove, set, update } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { audioUrl as mediaUrl, saveImage } from '../lib/media';

// A shared 16:9 board. Strokes are stored in a 1600 × 900 space, so the board looks the same
// scaled to any screen. Everything syncs live through the Realtime Database and stays saved, so
// the teacher can prepare a board before class (in a task's Board tab or as a board in the text).

const W = 1600;
const H = 900;
type Tool = 'move' | 'pen' | 'marker' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'eraser' | 'laser';
type Kind = Exclude<Tool, 'move' | 'eraser' | 'laser'> | 'image';
export type Stroke = { id: string; by: string; tool: Kind; color: string; size: number; pts: number[][]; text?: string; media?: string; t: number };

// No red or green: those colours mean right and wrong answers.
const COLORS = ['#2f2e2d', '#2f5fa8', '#d98f63', '#8a857e', '#d9a13a', '#7a4a86'];
const TOOLS: { key: Tool; label: string; icon: string }[] = [
  { key: 'move', label: 'Select and move', icon: 'M5 3l14 7-6 2-2 6z' },
  { key: 'pen', label: 'Pen', icon: 'M4 20l4-1L19 8l-3-3L5 16z' },
  { key: 'marker', label: 'Highlighter', icon: 'M6 18l3 1 9-9-4-4-9 9zM14 4l6 6' },
  { key: 'line', label: 'Line', icon: 'M5 19L19 5' },
  { key: 'arrow', label: 'Arrow', icon: 'M5 19L19 5M11 5h8v8' },
  { key: 'rect', label: 'Rectangle', icon: 'M4 6h16v12H4z' },
  { key: 'ellipse', label: 'Ellipse', icon: 'M12 5c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7z' },
  { key: 'text', label: 'Text', icon: 'M5 6h14M12 6v13' },
  { key: 'eraser', label: 'Eraser', icon: 'M8 20h12M4 16l9-9 5 5-6 6H8z' },
  { key: 'laser', label: 'Pointer: everyone sees where you point', icon: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 3v3M12 18v3M3 12h3M18 12h3' },
];
// People's cursors on the board, each in their own colour (not red or green).
const CUR_COLORS = ['#3d6fb6', '#7a5cb8', '#c7772f', '#b8508f', '#4f6b7a', '#a8861a', '#4a55a8', '#8a6a4a'];
const curColor = (uid: string) => {
  let h = 0;
  for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CUR_COLORS[h % CUR_COLORS.length];
};
type Cur = { x: number; y: number; n: string; c: string; l?: boolean; at: number };
const IMAGE_ICON = 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01';

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

const textSize = (size: number) => size * 6 + 12;
// Rough box around a stroke, for selecting and moving.
function boxOf(s: Stroke) {
  if (s.tool === 'text') {
    const [x, y] = s.pts[0];
    const fs = textSize(s.size);
    return { x, y, w: Math.max(fs, (s.text ?? '').length * fs * 0.5), h: fs * 1.3 };
  }
  const xs = s.pts.map((p) => p[0]);
  const ys = s.pts.map((p) => p[1]);
  const pad = s.tool === 'image' ? 0 : s.size;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) - x + pad, h: Math.max(...ys) - y + pad };
}

function ImageShape({ s, classId }: { s: Stroke; classId: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (s.media) mediaUrl(classId, s.media).then(setUrl).catch(() => {});
  }, [classId, s.media]);
  const b = boxOf(s);
  return url ? <image href={url} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="xMidYMid meet" /> : <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8" fill="#f4f4f3" />;
}

function Shape({ s, classId }: { s: Stroke; classId: string }) {
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
  if (!a || !b) return null;
  const common = { stroke: s.color, strokeWidth: s.size, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (s.tool === 'image') return <ImageShape s={s} classId={classId} />;
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
      <text x={a[0]} y={a[1]} fill={s.color} fontSize={textSize(s.size)} fontFamily="Karla, system-ui, sans-serif" dominantBaseline="hanging">
        {s.text}
      </text>
    );
  return <path d={pathOf(s.pts, s.size, s.tool === 'marker')} fill={s.color} opacity={s.tool === 'marker' ? 0.35 : 1} />;
}

const inBox = (s: Stroke, x: number, y: number, pad = 10) => {
  const b = boxOf(s);
  return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
};
const nearStroke = (s: Stroke, x: number, y: number) =>
  s.tool === 'image' || s.tool === 'text' || s.tool === 'rect' || s.tool === 'ellipse'
    ? inBox(s, x, y)
    : s.pts.some((p, i) => {
        const q = s.pts[i + 1] ?? p;
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const t = dx || dy ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy))) : 0;
        return Math.hypot(x - (p[0] + t * dx), y - (p[1] + t * dy)) < 18 + s.size;
      });

// Shrinks a picture to at most 1400 × 1000 px and saves it with the class media.
async function imageFromFile(classId: string, file: Blob) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / bmp.width, 1000 / bmp.height);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.85;
  let blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
  while (blob.size > 500 * 1024 && q > 0.4) {
    q -= 0.15;
    blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
  }
  const id = await saveImage(classId, blob);
  return { id, w: c.width, h: c.height };
}

// free: a group's or a learner's own board, where everyone in it draws unless the teacher locks it.
export function Whiteboard({ classId, boardId, uid, teacher, people = [], compact, free, name = '' }: { classId: string; boardId: string; uid: string; teacher: boolean; people?: { uid: string; name: string }[]; compact?: boolean; free?: boolean; name?: string }) {
  const base = `sessions/${classId}/board/${boardId}`;
  const [strokes, setStrokes] = useState<Record<string, Stroke>>({});
  const [pen, setPen] = useState<string>('teacher');
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(8);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number; id?: string } | null>(null);
  const [textVal, setTextVal] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [frameW, setFrameW] = useState(800);
  const [curs, setCurs] = useState<Record<string, Cur>>({});
  const [showCur, setShowCur] = useState(false);
  const curSent = useRef(0);
  const curOn = useRef(false);
  const svg = useRef<SVGSVGElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const lastSend = useRef(0);
  const drag = useRef<{ id: string; from: number[]; orig: number[][]; resize: boolean } | null>(null);

  useEffect(() => {
    const u1 = onValue(ref(rtdb, `${base}/strokes`), (s) => setStrokes(s.val() ?? {}), () => {});
    const u2 = onValue(ref(rtdb, `${base}/pen`), (s) => setPen(s.val() ?? 'teacher'), () => {});
    const u3 = onValue(ref(rtdb, `${base}/cur`), (s) => setCurs((s.val() as Record<string, Cur>) ?? {}), () => {});
    const u4 = onValue(ref(rtdb, `${base}/showCur`), (s) => setShowCur(!!s.val()), () => {});
    onDisconnect(ref(rtdb, `${base}/cur/${uid}`)).remove().catch(() => {});
    return () => (u1(), u2(), u3(), u4(), void remove(ref(rtdb, `${base}/cur/${uid}`)).catch(() => {}));
  }, [base, uid]);
  useEffect(() => {
    if (!svg.current) return;
    const ro = new ResizeObserver(() => svg.current && setFrameW(svg.current.getBoundingClientRect().width / zoomOf(svg.current) || 800));
    ro.observe(svg.current);
    return () => ro.disconnect();
  }, []);

  const canDraw = teacher || (free ? pen !== 'locked' : pen === 'all' || pen === uid);
  const list = useMemo(() => Object.values(strokes).sort((a, b) => a.t - b.t), [strokes]);
  const mine = (s: Stroke) => teacher || s.by === uid;

  const at = (e: { clientX: number; clientY: number; pressure?: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, e.pressure || 0.5];
  };
  const save = (s: Stroke) => set(ref(rtdb, `${base}/strokes/${s.id}`), s).catch(() => {});
  const newSid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  async function addImage(file: Blob | null | undefined) {
    if (!file || !teacher) return;
    setBusy('Adding the picture…');
    try {
      const { id, w, h } = await imageFromFile(classId, file);
      const scale = Math.min(1, (W * 0.6) / w, (H * 0.7) / h);
      const iw = w * scale;
      const ih = h * scale;
      const x = (W - iw) / 2;
      const y = (H - ih) / 2;
      const s: Stroke = { id: newSid(), by: uid, tool: 'image', color: '', size: 0, pts: [[x, y], [x + iw, y + ih]], media: id, t: Date.now() };
      await save(s);
      setTool('move');
      setSel(s.id);
      setBusy('');
    } catch (e) {
      console.error(e);
      setBusy('The picture could not be added. Try a smaller one.');
      window.setTimeout(() => setBusy(''), 3000);
    }
  }

  // Paste a picture straight onto the board while the pointer is over it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!root.current?.matches(':hover') || !teacher) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        e.stopPropagation();
        addImage(item.getAsFile());
      }
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  });

  // Delete the selected item with the Delete key.
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if ((e.key === 'Delete' || e.key === 'Backspace') && el?.tagName !== 'INPUT' && el?.tagName !== 'TEXTAREA' && !el?.isContentEditable) {
        e.preventDefault();
        remove(ref(rtdb, `${base}/strokes/${sel}`)).catch(() => {});
        setSel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, base]);

  const down = (e: React.PointerEvent) => {
    if (!canDraw) return;
    const p = at(e);
    if (tool === 'move') {
      const selected = sel ? strokes[sel] : undefined;
      if (selected && selected.tool === 'image') {
        const b = boxOf(selected);
        if (Math.hypot(p[0] - (b.x + b.w), p[1] - (b.y + b.h)) < 30) {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { id: selected.id, from: p, orig: selected.pts, resize: true };
          return;
        }
      }
      const hit = [...list].reverse().find((s) => mine(s) && nearStroke(s, p[0], p[1]));
      setSel(hit?.id ?? null);
      if (hit) {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        drag.current = { id: hit.id, from: p, orig: hit.pts, resize: false };
      }
      return;
    }
    if (tool === 'eraser') {
      const hit = [...list].reverse().find((s) => mine(s) && nearStroke(s, p[0], p[1]));
      if (hit) remove(ref(rtdb, `${base}/strokes/${hit.id}`)).catch(() => {});
      return;
    }
    if (tool === 'text') {
      e.preventDefault(); // keep the focus for the text field
      const hit = [...list].reverse().find((s) => s.tool === 'text' && mine(s) && inBox(s, p[0], p[1], 4));
      if (hit) setSize(hit.size);
      setTextAt(hit ? { x: hit.pts[0][0], y: hit.pts[0][1], id: hit.id } : { x: p[0], y: p[1] });
      setTextVal(hit?.text ?? '');
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraft({ id: newSid(), by: uid, tool: tool as Kind, color, size, pts: [p], t: Date.now() });
  };
  // Where my pointer is, for everyone (when cursors are shown, or I am using the pointer).
  const sendCursor = (e: React.PointerEvent) => {
    if (!showCur && tool !== 'laser') return;
    const now = Date.now();
    if (now - curSent.current < 60) return;
    curSent.current = now;
    const p = at(e);
    curOn.current = true;
    set(ref(rtdb, `${base}/cur/${uid}`), { x: Math.round(p[0]), y: Math.round(p[1]), n: name || (teacher ? 'Teacher' : ''), c: curColor(uid), l: tool === 'laser', at: now } satisfies Cur).catch(() => {});
  };
  const hideCursor = () => {
    if (!curOn.current) return;
    curOn.current = false;
    remove(ref(rtdb, `${base}/cur/${uid}`)).catch(() => {});
  };
  const move = (e: React.PointerEvent) => {
    sendCursor(e);
    if (tool === 'laser') return;
    const p = at(e);
    if (drag.current) {
      const d = drag.current;
      const s = strokes[d.id];
      if (!s) return;
      let pts: number[][];
      if (d.resize) {
        const [a, b] = d.orig;
        const ratio = (b[1] - a[1]) / Math.max(1, b[0] - a[0]);
        const w = Math.max(60, b[0] - a[0] + (p[0] - d.from[0]));
        pts = [a, [a[0] + w, a[1] + w * ratio]];
      } else pts = d.orig.map((q) => [q[0] + p[0] - d.from[0], q[1] + p[1] - d.from[1], ...(q.length > 2 ? [q[2]] : [])]);
      setStrokes((all) => ({ ...all, [d.id]: { ...s, pts } }));
      if (Date.now() - lastSend.current > 80) {
        lastSend.current = Date.now();
        update(ref(rtdb, `${base}/strokes/${d.id}`), { pts }).catch(() => {});
      }
      return;
    }
    if (!draft) return;
    const next = { ...draft, pts: ['pen', 'marker'].includes(draft.tool) ? [...draft.pts, p] : [draft.pts[0], p] };
    setDraft(next);
    if (Date.now() - lastSend.current > 80) {
      lastSend.current = Date.now();
      save(next);
    }
  };
  const up = () => {
    if (drag.current) {
      const s = strokes[drag.current.id];
      if (s) update(ref(rtdb, `${base}/strokes/${s.id}`), { pts: s.pts }).catch(() => {});
      drag.current = null;
      return;
    }
    if (!draft) return;
    save(draft);
    setDraft(null);
  };
  const undo = () => {
    const last = [...list].reverse().find((s) => s.by === uid);
    if (last) remove(ref(rtdb, `${base}/strokes/${last.id}`)).catch(() => {});
  };
  const clear = () => void ask('Clear the whole board for everyone?').then((ok) => { if (ok) remove(ref(rtdb, `${base}/strokes`)).catch(() => {}); });
  const commitText = () => {
    if (textAt) {
      const v = textVal.trim();
      if (textAt.id && !v) remove(ref(rtdb, `${base}/strokes/${textAt.id}`)).catch(() => {});
      else if (textAt.id) update(ref(rtdb, `${base}/strokes/${textAt.id}`), { text: v, color, size }).catch(() => {});
      else if (v) save({ id: newSid(), by: uid, tool: 'text', color, size, pts: [[textAt.x, textAt.y]], text: v, t: Date.now() });
    }
    setTextAt(null);
  };

  const shown = (draft ? [...list.filter((s) => s.id !== draft.id), draft] : list).filter((s) => s.id !== textAt?.id);
  const selBox = sel && strokes[sel] && tool === 'move' ? boxOf(strokes[sel]) : null;
  const k = frameW / W;
  return (
    <div ref={root} className={'wb' + (compact ? ' compact' : '')} onDragStart={(e) => e.preventDefault()}>
      <div className="wb-bar" role="toolbar" aria-label="Board tools">
        {canDraw ? (
          <>
            {TOOLS.map((t) => (
              <button key={t.key} type="button" className={'wb-tool' + (tool === t.key ? ' on' : '')} title={t.label} aria-label={t.label} onClick={() => (setTool(t.key), t.key !== 'move' && setSel(null))}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
              </button>
            ))}
            {teacher && (
              <button type="button" className="wb-tool" title="Add a picture (you can also paste one)" aria-label="Add a picture" onClick={() => fileIn.current?.click()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={IMAGE_ICON} />
                </svg>
              </button>
            )}
            <input ref={fileIn} type="file" accept="image/*" hidden onChange={(e) => (addImage(e.target.files?.[0]), (e.target.value = ''))} />
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
          <>
            <button type="button" className={'wb-tool' + (tool === 'laser' ? ' on' : '')} title="Pointer: everyone sees where you point" aria-label="Pointer" onClick={() => setTool(tool === 'laser' ? 'pen' : 'laser')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d={TOOLS.find((t) => t.key === 'laser')!.icon} />
              </svg>
            </button>
            <span className="hint">{pen === 'locked' ? 'Your teacher has locked this board.' : 'Your teacher is drawing. You can draw when your teacher gives you the pen.'}</span>
          </>
        )}
        {teacher && (
          <label className="wb-showcur" data-tip="Everyone sees where everyone’s cursor is on the board">
            <input type="checkbox" checked={showCur} onChange={(e) => set(ref(rtdb, `${base}/showCur`), e.target.checked || null).catch(() => {})} />
            Show everyone’s cursor
          </label>
        )}
        {teacher && !free && (
          <NSelect className="wb-pen" value={pen === 'locked' ? 'teacher' : pen} onChange={(e) => set(ref(rtdb, `${base}/pen`), e.target.value).catch(() => {})} aria-label="Who can draw">
            <option value="teacher">Only I draw</option>
            <option value="all">Everyone can draw</option>
            {people.map((p) => (
              <option key={p.uid} value={p.uid}>
                {p.name} draws
              </option>
            ))}
          </NSelect>
        )}
        {!teacher && canDraw && <span className="wb-you">You have the pen</span>}
      </div>
      <div className="wb-frame">
        <svg ref={svg} className={'wb-canvas' + (canDraw || tool === 'laser' ? ' can t-' + tool : '')} viewBox={`0 0 ${W} ${H}`} onPointerDown={(e) => tool !== 'laser' && down(e)} onPointerMove={move} onPointerUp={up} onPointerLeave={() => (up(), hideCursor())}>
          <rect width={W} height={H} fill="transparent" />
          {shown.map((s) => (
            <Shape key={s.id} s={s} classId={classId} />
          ))}
          {selBox && (
            <g className="wb-sel" pointerEvents="none">
              <rect x={selBox.x - 6} y={selBox.y - 6} width={selBox.w + 12} height={selBox.h + 12} rx="6" />
              {strokes[sel!].tool === 'image' && <circle cx={selBox.x + selBox.w} cy={selBox.y + selBox.h} r="11" />}
            </g>
          )}
        </svg>
        <div className="wb-curs" aria-hidden="true">
          {Object.entries(curs)
            .filter(([id, c]) => (id !== uid || (c.l && tool === 'laser')) && Date.now() - c.at < 15000 && (showCur || c.l))
            .map(([id, c]) => (
              <span key={id} className={'wb-cur' + (c.l ? ' laser' : '')} style={{ left: `${(c.x / W) * 100}%`, top: `${(c.y / H) * 100}%`, ['--cc' as string]: c.c }}>
                {c.l ? (
                  <i className="wb-laser" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16">
                    <path d="M1 1l5.5 13 2-5.5L14 6.5z" fill="currentColor" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                )}
                {c.n && id !== uid && <b>{c.n.split(' ')[0]}</b>}
              </span>
            ))}
          {tool === 'laser' && <span className="wb-laser-hint">Pointer on: everyone sees where you point</span>}
        </div>
        {textAt && (
          <input aria-label="Text on the board"
            className="wb-text"
            autoFocus
            value={textVal}
            placeholder="Type, then press Enter"
            style={{ left: `${(textAt.x / W) * 100}%`, top: `${(textAt.y / H) * 100}%`, color, fontSize: Math.max(12, textSize(size) * k) }}
            onChange={(e) => setTextVal(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => (e.key === 'Enter' ? commitText() : e.key === 'Escape' && setTextAt(null))}
          />
        )}
        {busy && <span className="wb-busy">{busy}</span>}
        {tool === 'move' && sel && canDraw && (
          <button type="button" className="wb-del" onClick={() => (remove(ref(rtdb, `${base}/strokes/${sel}`)).catch(() => {}), setSel(null))}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

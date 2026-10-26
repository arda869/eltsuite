import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useImageSrc } from './PackNode';

// Picture editing that never changes the stored picture: a crop and a colour filter are kept on the
// picture in the task, so the teacher can change them again later. Printing and Word files bake
// them into a copy of the picture.

// ------------------------------------------------------------------ colour filters

type Fn = ['grayscale' | 'sepia' | 'saturate' | 'hue-rotate' | 'brightness' | 'contrast', number];
export type PicFilter = '' | 'mono' | 'sepia' | 'warm' | 'blue' | 'vivid' | 'bright' | 'faded';
export const PIC_FILTERS: { k: PicFilter; label: string; fns: Fn[] }[] = [
  { k: '', label: 'Original', fns: [] },
  { k: 'mono', label: 'Black and white', fns: [['grayscale', 1], ['contrast', 1.08]] },
  { k: 'sepia', label: 'Sepia', fns: [['sepia', 0.75], ['contrast', 0.96]] },
  { k: 'warm', label: 'Warm', fns: [['sepia', 0.22], ['saturate', 1.3], ['brightness', 1.02]] },
  { k: 'blue', label: 'Blue', fns: [['grayscale', 1], ['sepia', 0.55], ['hue-rotate', 175], ['saturate', 1.3]] },
  { k: 'vivid', label: 'Vivid', fns: [['saturate', 1.45], ['contrast', 1.08]] },
  { k: 'bright', label: 'Bright', fns: [['brightness', 1.15], ['contrast', 1.04]] },
  { k: 'faded', label: 'Faded', fns: [['contrast', 0.82], ['brightness', 1.08], ['saturate', 0.7]] },
];

export function filterCss(k?: string) {
  const f = PIC_FILTERS.find((x) => x.k === (k ?? ''));
  return f && f.fns.length ? f.fns.map(([n, v]) => `${n}(${n === 'hue-rotate' ? v + 'deg' : v})`).join(' ') : undefined;
}

// The same filters as one colour matrix (3 rows of r, g, b, offset), for baking into a copy.
type M = number[][];
const lin = (a: number[][]): M => a.map((r) => [...r, 0]);
function fnMatrix([n, v]: Fn): M {
  if (n === 'grayscale' || n === 'sepia') {
    const s = 1 - Math.min(1, v);
    return n === 'grayscale'
      ? lin([
          [0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s],
          [0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s],
          [0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s],
        ])
      : lin([
          [0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s],
          [0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s],
          [0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s],
        ]);
  }
  if (n === 'saturate')
    return lin([
      [0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v],
      [0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v],
      [0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v],
    ]);
  if (n === 'hue-rotate') {
    const a = (v * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return lin([
      [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
      [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
      [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
    ]);
  }
  if (n === 'brightness') return [[v, 0, 0, 0], [0, v, 0, 0], [0, 0, v, 0]];
  const o = 0.5 - 0.5 * v; // contrast
  return [[v, 0, 0, o], [0, v, 0, o], [0, 0, v, o]];
}
const after = (b: M, a: M): M => b.map((row) => [0, 1, 2, 3].map((j) => row[0] * a[0][j] + row[1] * a[1][j] + row[2] * a[2][j] + (j === 3 ? row[3] : 0)));
function filterMatrix(k: string): M | null {
  const f = PIC_FILTERS.find((x) => x.k === k);
  if (!f || !f.fns.length) return null;
  return f.fns.reduce<M>((m, fn) => after(fnMatrix(fn), m), [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]);
}

// ------------------------------------------------------------------ crop

// A crop is "x y w h": fractions of the picture's width and height.
export function parseCrop(s?: string): [number, number, number, number] | null {
  const v = String(s ?? '').trim().split(/\s+/).map(Number);
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = v;
  return w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= 1.0001 && y + h <= 1.0001 ? [x, y, w, h] : null;
}

// Styles that show only the cropped part: a box with the cropped shape, the picture moved inside it.
export function cropStyles(crop?: string, ar?: number): { box?: CSSProperties; img?: CSSProperties } {
  const c = parseCrop(crop);
  if (!c || !ar) return {};
  const [x, y, w, h] = c;
  return {
    box: { position: 'relative', display: 'block', aspectRatio: String(ar), overflow: 'hidden' },
    img: { position: 'absolute', maxWidth: 'none', width: `${100 / w}%`, height: `${100 / h}%`, left: `${(-x / w) * 100}%`, top: `${(-y / h) * 100}%` },
  };
}

const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    if (/^https?:/i.test(url)) im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image'));
    im.src = url;
  });

// A copy of the picture with its crop and filter, for printing and Word files.
export async function bakePicture(url: string, crop?: string, filter?: string, maxW = 1600): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const im = await loadImg(url);
    const nw = im.naturalWidth || 400;
    const nh = im.naturalHeight || 300;
    const [x, y, w, h] = parseCrop(crop) ?? [0, 0, 1, 1];
    const sw = w * nw;
    const sh = h * nh;
    const scale = Math.min(1, maxW / sw);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * scale));
    c.height = Math.max(1, Math.round(sh * scale));
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(im, x * nw, y * nh, sw, sh, 0, 0, c.width, c.height);
    const m = filterMatrix(filter ?? '');
    if (m) {
      const px = g.getImageData(0, 0, c.width, c.height);
      const d = px.data;
      const o = m.map((r) => r[3] * 255);
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const gg = d[i + 1];
        const b = d[i + 2];
        d[i] = m[0][0] * r + m[0][1] * gg + m[0][2] * b + o[0];
        d[i + 1] = m[1][0] * r + m[1][1] * gg + m[1][2] * b + o[1];
        d[i + 2] = m[2][0] * r + m[2][1] * gg + m[2][2] * b + o[2];
      }
      g.putImageData(px, 0, 0);
    }
    return { data: c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height };
  } catch {
    return null; // a picture from another site that does not allow copying
  }
}

// ------------------------------------------------------------------ the editor

type Rect = { x: number; y: number; w: number; h: number };
const ASPECTS: { k: string; label: string; r: number | 'orig' | null }[] = [
  { k: 'free', label: 'Free', r: null },
  { k: 'orig', label: 'Original', r: 'orig' },
  { k: '1', label: 'Square', r: 1 },
  { k: '43', label: '4 : 3', r: 4 / 3 },
  { k: '32', label: '3 : 2', r: 3 / 2 },
  { k: '169', label: '16 : 9', r: 16 / 9 },
];
const MIN = 0.06;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function PictureEditor({ classId, src, crop, filter, onSave, onClose }: { classId: string; src: string; crop: string; filter: string; onSave: (v: { crop: string; ar: number; filter: string }) => void; onClose: () => void }) {
  const url = useImageSrc(classId, src);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<Rect>(() => {
    const c = parseCrop(crop);
    return c ? { x: c[0], y: c[1], w: c[2], h: c[3] } : { x: 0, y: 0, w: 1, h: 1 };
  });
  const [aspect, setAspect] = useState('free');
  const [filt, setFilt] = useState(filter || '');
  const stage = useRef<HTMLDivElement>(null);
  const [disp, setDisp] = useState({ w: 480, h: 360 });
  const drag = useRef<{ kind: string; x: number; y: number; r: Rect } | null>(null);

  // Fit the picture into the space available.
  useLayoutEffect(() => {
    if (!nat || !stage.current) return;
    const fit = () => {
      const sw = stage.current?.clientWidth ?? 480;
      const maxH = Math.min(420, window.innerHeight * 0.5);
      const ar = nat.w / nat.h;
      const w = Math.min(sw, maxH * ar);
      setDisp({ w, h: w / ar });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, [nat]);

  const lockOf = (k: string) => {
    const a = ASPECTS.find((x) => x.k === k)?.r;
    if (!a || !nat) return null;
    return (a === 'orig' ? nat.w / nat.h : a) * (nat.h / nat.w); // width : height in fractions
  };
  const chooseAspect = (k: string) => {
    setAspect(k);
    const lock = lockOf(k);
    if (!lock) return;
    const w = lock >= 1 ? 1 : lock;
    const h = lock >= 1 ? 1 / lock : 1;
    setRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  const down = (kind: string) => (e: RPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, r: rect };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / disp.w;
    const dy = (e.clientY - d.y) / disp.h;
    const r0 = d.r;
    if (d.kind === 'move') return setRect({ ...r0, x: clamp(r0.x + dx, 0, 1 - r0.w), y: clamp(r0.y + dy, 0, 1 - r0.h) });
    const west = d.kind.includes('w');
    const north = d.kind.includes('n');
    const ax = west ? r0.x + r0.w : r0.x;
    const ay = north ? r0.y + r0.h : r0.y;
    const px = west ? clamp(r0.x + dx, 0, ax - MIN) : clamp(r0.x + r0.w + dx, ax + MIN, 1);
    const py = north ? clamp(r0.y + dy, 0, ay - MIN) : clamp(r0.y + r0.h + dy, ay + MIN, 1);
    let w = Math.abs(px - ax);
    let h = Math.abs(py - ay);
    const lock = lockOf(aspect);
    if (lock) {
      if (w / h > lock) w = h * lock;
      else h = w / lock;
      const maxW = west ? ax : 1 - ax;
      const maxH = north ? ay : 1 - ay;
      if (w > maxW) (w = maxW), (h = w / lock);
      if (h > maxH) (h = maxH), (w = h * lock);
    }
    setRect({ x: west ? ax - w : ax, y: north ? ay - h : ay, w, h });
  };
  const up = () => (drag.current = null);

  const save = () => {
    if (!nat) return onClose();
    const full = rect.x < 0.002 && rect.y < 0.002 && rect.w > 0.996 && rect.h > 0.996;
    const f = (n: number) => +n.toFixed(4);
    onSave({ crop: full ? '' : `${f(rect.x)} ${f(rect.y)} ${f(rect.w)} ${f(rect.h)}`, ar: full ? 0 : +((rect.w * nat.w) / (rect.h * nat.h)).toFixed(4), filter: filt });
  };

  const fcss = filterCss(filt);
  return createPortal(
    <div className="scrim" onClick={onClose}>
      <div className="dialog pe-dialog" role="dialog" aria-label="Edit picture" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Edit picture</h2>
        <div className="pe-stage" ref={stage}>
          {url ? (
            <div className="pe-wrap" style={{ width: disp.w, height: disp.h }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
              <img src={url} alt="" draggable={false} style={{ filter: fcss }} onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth || 400, h: e.currentTarget.naturalHeight || 300 })} />
              {nat && (
                <div className="pe-crop" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} onPointerDown={down('move')}>
                  <span className="pe-third v1" />
                  <span className="pe-third v2" />
                  <span className="pe-third h1" />
                  <span className="pe-third h2" />
                  {['nw', 'ne', 'sw', 'se'].map((k) => (
                    <span key={k} className={'pe-handle ' + k} onPointerDown={down(k)} aria-hidden="true" />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="pic-wait" style={{ width: 320 }} />
          )}
        </div>
        <div className="field" style={{ gap: 6 }}>
          <span>Crop</span>
          <span className="seg small-seg" role="radiogroup" aria-label="Crop shape">
            {ASPECTS.map((a) => (
              <button key={a.k} type="button" role="radio" aria-checked={aspect === a.k} className={aspect === a.k ? 'on' : ''} onClick={() => chooseAspect(a.k)}>
                {a.label}
              </button>
            ))}
          </span>
          <span className="hint">Drag the corners to crop. Drag the box to move it.</span>
        </div>
        <div className="field" style={{ gap: 6 }}>
          <span>Colour</span>
          <div className="pe-filters" role="radiogroup" aria-label="Colour filter">
            {PIC_FILTERS.map((f) => (
              <button key={f.k || 'none'} type="button" role="radio" aria-checked={filt === f.k} className={'pe-filter' + (filt === f.k ? ' on' : '')} onClick={() => setFilt(f.k)}>
                <span className="pe-sw">{url && <img src={url} alt="" style={{ filter: filterCss(f.k) }} />}</span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        </div>
        <span className="pe-actions">
          <button
            type="button"
            className="btn link"
            onClick={() => {
              setRect({ x: 0, y: 0, w: 1, h: 1 });
              setAspect('free');
              setFilt('');
            }}
          >
            Reset
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={!nat}>
            Save
          </button>
        </span>
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ covers

// A picture can stay covered until it is clicked, or sit behind a grid of numbered boxes that open
// one at a time: "what can you see?" On the teaching screen the teacher's boxes open for the class.
export type CoverMode = '' | 'tap' | 'grid';
export type CoverProps = { mode: CoverMode; grid: number; opened: number[]; canOpen: boolean; onChange: (opened: number[]) => void; teacherTools?: boolean; waiting?: string };

export function PicCover({ mode, grid, opened, canOpen, onChange, teacherTools, waiting }: CoverProps) {
  const n = mode === 'grid' ? clamp(grid || 3, 2, 5) : 1;
  const all = Array.from({ length: n * n }, (_, i) => i);
  const open = new Set(opened);
  const done = all.every((i) => open.has(i));
  const [hover, setHover] = useState(false);
  useEffect(() => setHover(false), [done]);
  return (
    <span className={'pc' + (done ? ' done' : '')} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span className="pc-grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, gridTemplateRows: `repeat(${n}, 1fr)` }}>
        {all.map((i) => (
          <button
            key={i}
            type="button"
            className={'pc-box' + (open.has(i) ? ' open' : '') + (n === 1 ? ' whole' : '')}
            disabled={!canOpen || open.has(i)}
            tabIndex={open.has(i) ? -1 : 0}
            aria-label={n === 1 ? 'Show the picture' : `Open box ${i + 1}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange([...opened, i]);
            }}
          >
            {n === 1 ? (
              <span className="pc-whole-label">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {canOpen ? 'Show the picture' : waiting || 'Your teacher will show this'}
              </span>
            ) : (
              <span className="pc-num">{i + 1}</span>
            )}
          </button>
        ))}
      </span>
      {teacherTools && canOpen && (hover || done) && (opened.length > 0 || n > 1) && (
        <span className="pc-tools">
          {!done && n > 1 && (
            <button type="button" onClick={(e) => (e.stopPropagation(), onChange(all))}>
              Show all
            </button>
          )}
          {opened.length > 0 && (
            <button type="button" onClick={(e) => (e.stopPropagation(), onChange([]))}>
              Cover again
            </button>
          )}
        </span>
      )}
    </span>
  );
}

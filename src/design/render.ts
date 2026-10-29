import { getStroke } from 'perfect-freehand';
import type { DPage, El, Fx, ShapeKind } from './model';

// Drawing a page: the same code draws it on screen while you work, and for downloads and printing,
// so what you see is what you get.

export type View = 'all' | 'A' | 'B';
export type Env = {
  imgs: Map<string, CanvasImageSource>; // pictures by media id, people and things by artKey, QR codes by 'qr:' + link
  view: View;
  learner?: boolean; // label words hidden, for learners to write
  accent: string;
  editing?: boolean; // empty frames and placeholders show
  skip?: string; // the thing being typed in
  page?: DPage;
  all?: El[]; // everything on the page, for the word bank
};

export const INK = '#262420';
export const MUTED = '#66615b';
export const HAIR = '#d6d3cd';

export const artKey = (e: El, accent: string) => `art:${e.art}:${e.ref}:${e.pose ?? ''}:${e.face ?? ''}:${e.accent ?? accent}`;

export function visible(e: El, view: View) {
  if (e.hidden) return false;
  if (view === 'A' && e.ver === 'B') return false;
  if (view === 'B' && e.ver === 'A') return false;
  return true;
}

export function fxFilter(fx?: Fx) {
  if (!fx) return 'none';
  const f: string[] = [];
  if (fx.bright) f.push(`brightness(${1 + fx.bright / 100})`);
  if (fx.contrast) f.push(`contrast(${1 + fx.contrast / 100})`);
  if (fx.sat) f.push(`saturate(${1 + fx.sat / 100})`);
  if (fx.gray) f.push(`grayscale(${fx.gray / 100})`);
  if (fx.sepia) f.push(`sepia(${fx.sepia / 100})`);
  if (fx.hue) f.push(`hue-rotate(${fx.hue}deg)`);
  if (fx.invert) f.push(`invert(${fx.invert / 100})`);
  if (fx.blur) f.push(`blur(${fx.blur}px)`);
  return f.length ? f.join(' ') : 'none';
}

// ------------------------------------------------------------------ shapes

const poly = (pts: [number, number][]) => {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
};
const ngon = (n: number, w: number, h: number, rot = -Math.PI / 2) => poly(Array.from({ length: n }, (_, i) => [w / 2 + (w / 2) * Math.cos(rot + (i * 2 * Math.PI) / n), h / 2 + (h / 2) * Math.sin(rot + (i * 2 * Math.PI) / n)] as [number, number]));
const star = (w: number, h: number, n = 5, inner = 0.45) =>
  poly(Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : 1;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    return [w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)] as [number, number];
  }));

export const isLine = (s?: ShapeKind) => s === 'line' || s === 'arrow' || s === 'double';
export const TAIL = 0.2; // the part of a speech bubble's height that is its tail

export function shapePath(k: ShapeKind, w: number, h: number, radius = 0): Path2D {
  const p = new Path2D();
  switch (k) {
    case 'rect':
      p.roundRect(0, 0, w, h, Math.min(radius, w / 2, h / 2));
      return p;
    case 'ellipse':
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      return p;
    case 'triangle':
      return poly([[w / 2, 0], [w, h], [0, h]]);
    case 'diamond':
      return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'pentagon':
      return ngon(5, w, h);
    case 'hexagon':
      return ngon(6, w, h, 0);
    case 'star':
      return star(w, h);
    case 'shout':
      return star(w, h, 12, 0.72);
    case 'heart':
      p.moveTo(w / 2, h * 0.28);
      p.bezierCurveTo(w * 0.5, h * 0.05, w * 0.05, h * -0.02, w * 0.02, h * 0.32);
      p.bezierCurveTo(0, h * 0.6, w * 0.35, h * 0.78, w / 2, h);
      p.bezierCurveTo(w * 0.65, h * 0.78, w, h * 0.6, w * 0.98, h * 0.32);
      p.bezierCurveTo(w * 0.95, h * -0.02, w * 0.5, h * 0.05, w / 2, h * 0.28);
      p.closePath();
      return p;
    case 'speech': {
      const bh = h * (1 - TAIL);
      const r = Math.min(radius || 24, w / 2, bh / 2);
      p.moveTo(r, 0);
      p.arcTo(w, 0, w, bh, r);
      p.arcTo(w, bh, 0, bh, r);
      p.lineTo(w * 0.36, bh);
      p.lineTo(w * 0.16, h);
      p.lineTo(w * 0.22, bh);
      p.arcTo(0, bh, 0, 0, r);
      p.arcTo(0, 0, w, 0, r);
      p.closePath();
      return p;
    }
    case 'thought': {
      const bh = h * (1 - TAIL);
      p.ellipse(w / 2, bh / 2, w / 2, bh / 2, 0, 0, Math.PI * 2);
      p.moveTo(w * 0.24 + h * 0.06, bh + h * 0.07);
      p.ellipse(w * 0.24, bh + h * 0.07, h * 0.06, h * 0.05, 0, 0, Math.PI * 2);
      p.moveTo(w * 0.14 + h * 0.035, h - h * 0.035);
      p.ellipse(w * 0.14, h - h * 0.035, h * 0.035, h * 0.03, 0, 0, Math.PI * 2);
      return p;
    }
    case 'cloud': {
      const bumps: [number, number, number][] = [[0.25, 0.55, 0.22], [0.42, 0.35, 0.25], [0.62, 0.32, 0.22], [0.78, 0.5, 0.2], [0.6, 0.68, 0.24], [0.36, 0.7, 0.22]];
      for (const [x, y, r] of bumps) p.moveTo(w * x + w * r, h * y), p.ellipse(w * x, h * y, w * r, h * r * 1.15, 0, 0, Math.PI * 2);
      return p;
    }
    case 'banner':
      return poly([[0, h * 0.15], [w, h * 0.15], [w * 0.94, h * 0.5], [w, h * 0.85], [0, h * 0.85], [w * 0.06, h * 0.5]]);
    case 'tick':
      p.moveTo(w * 0.08, h * 0.55);
      p.lineTo(w * 0.38, h * 0.88);
      p.lineTo(w * 0.94, h * 0.12);
      return p;
    case 'cross':
      p.moveTo(w * 0.12, h * 0.12);
      p.lineTo(w * 0.88, h * 0.88);
      p.moveTo(w * 0.88, h * 0.12);
      p.lineTo(w * 0.12, h * 0.88);
      return p;
    default:
      p.moveTo(0, h / 2);
      p.lineTo(w, h / 2);
      return p;
  }
}
// Where the words go inside a shape.
export function textBox(e: El): { x: number; y: number; w: number; h: number } {
  const { w, h } = e;
  const pad = Math.max(8, Math.min(w, h) * 0.08);
  switch (e.shape) {
    case 'speech':
    case 'thought':
      return { x: pad + w * 0.04, y: pad, w: w - 2 * pad - w * 0.08, h: h * (1 - TAIL) - 2 * pad };
    case 'ellipse':
    case 'cloud':
    case 'shout':
    case 'star':
      return { x: w * 0.18, y: h * 0.2, w: w * 0.64, h: h * 0.6 };
    case 'triangle':
      return { x: w * 0.25, y: h * 0.45, w: w * 0.5, h: h * 0.5 };
    case 'diamond':
    case 'heart':
      return { x: w * 0.22, y: h * 0.25, w: w * 0.56, h: h * 0.5 };
    default:
      return { x: pad, y: pad, w: w - 2 * pad, h: h - 2 * pad };
  }
}

// ------------------------------------------------------------------ text

export const fontOf = (e: Partial<El>, size?: number) => `${e.italic ? 'italic ' : ''}${e.bold ? 700 : 400} ${size ?? e.size ?? 22}px "${e.font ?? 'Fraunces'}", "Noto Sans", sans-serif`;

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const t = line + w;
      if (ctx.measureText(t.trimEnd()).width <= maxW || !line.trim()) {
        // A word longer than the line is broken where it has to be.
        if (!line.trim() && ctx.measureText(w).width > maxW && w.trim()) {
          let part = '';
          for (const ch of w) {
            if (ctx.measureText(part + ch).width > maxW && part) out.push(part), (part = '');
            part += ch;
          }
          line = part;
        } else line = t;
      } else {
        out.push(line.trimEnd());
        line = w.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

let measurer: CanvasRenderingContext2D | null = null;
const mctx = () => (measurer ??= document.createElement('canvas').getContext('2d')!);

export function layoutText(e: Partial<El>, maxW: number, ctx: CanvasRenderingContext2D = mctx()) {
  const size = e.size ?? 22;
  ctx.font = fontOf(e);
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(e.ls ?? 0) * (size / 22)}px`;
  const raw = e.upper ? (e.text ?? '').toUpperCase() : e.text ?? '';
  const lines = wrap(ctx, raw, Math.max(10, maxW));
  const lh = size * (e.lh ?? 1.4);
  return { lines, lh, height: Math.max(1, lines.length) * lh };
}
// A text's height follows its words.
export const textHeight = (e: Partial<El>, w: number) => Math.ceil(layoutText(e, w).height + 2);

function drawText(ctx: CanvasRenderingContext2D, e: El, box: { x: number; y: number; w: number; h: number }, override?: string) {
  const t = override !== undefined ? { ...e, text: override } : e;
  const { lines, lh, height } = layoutText(t, box.w, ctx);
  const size = e.size ?? 22;
  const top = box.y + (e.valign === 'middle' ? (box.h - height) / 2 : e.valign === 'bottom' ? box.h - height : 0);
  ctx.textBaseline = 'middle';
  const align = e.align ?? 'left';
  ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
  const ax = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w : box.x;
  lines.forEach((ln, i) => {
    const cy = top + i * lh + lh / 2;
    const wd = ctx.measureText(ln).width;
    const lx = align === 'center' ? ax - wd / 2 : align === 'right' ? ax - wd : ax;
    if (e.hl && ln) {
      ctx.fillStyle = e.hl;
      ctx.beginPath();
      ctx.roundRect(lx - size * 0.18, cy - size * 0.62, wd + size * 0.36, size * 1.24, size * 0.18);
      ctx.fill();
    }
    if (e.outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = e.outline * 2;
      ctx.strokeStyle = e.outlineC ?? '#ffffff';
      ctx.strokeText(ln, ax, cy);
    }
    ctx.fillStyle = e.color ?? INK;
    ctx.fillText(ln, ax, cy);
    if (e.underline && ln) {
      ctx.fillRect(lx, cy + size * 0.42, wd, Math.max(1, size / 16));
    }
  });
}

// ------------------------------------------------------------------ one thing

function drawPicture(ctx: CanvasRenderingContext2D, e: El, env: Env) {
  const im = e.img ? env.imgs.get(e.img) : undefined;
  const clip = new Path2D();
  clip.roundRect(0, 0, e.w, e.h, Math.min(e.radius ?? 0, e.w / 2, e.h / 2));
  if (e.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(38,36,32,0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#fff';
    ctx.fill(clip);
    ctx.restore();
  }
  if (!im) {
    if (env.editing) {
      ctx.fillStyle = '#ecebe7';
      ctx.fill(clip);
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = '#a9a49d';
      ctx.lineWidth = 1.5;
      ctx.stroke(clip);
      ctx.restore();
      const s = Math.min(e.w, e.h) * 0.22;
      ctx.save();
      ctx.translate(e.w / 2 - s / 2, e.h / 2 - s * 0.75);
      ctx.strokeStyle = '#a9a49d';
      ctx.lineWidth = Math.max(1.5, s / 16);
      ctx.beginPath();
      ctx.roundRect(0, 0, s, s * 0.8, s * 0.1);
      ctx.moveTo(s * 0.08, s * 0.68);
      ctx.lineTo(s * 0.38, s * 0.38);
      ctx.lineTo(s * 0.6, s * 0.58);
      ctx.lineTo(s * 0.72, s * 0.48);
      ctx.lineTo(s * 0.92, s * 0.68);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.7, s * 0.24, s * 0.08, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (e.h > 90 && e.w > 120) {
        ctx.fillStyle = '#8a847d';
        ctx.font = `600 ${Math.max(11, Math.min(15, e.w / 14))}px Karla, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Drop a picture here', e.w / 2, e.h / 2 + s * 0.45);
      }
    }
    return;
  }
  ctx.save();
  ctx.clip(clip);
  const iw = (im as HTMLImageElement).naturalWidth || (im as ImageBitmap).width || e.iw || 1;
  const ih = (im as HTMLImageElement).naturalHeight || (im as ImageBitmap).height || e.ih || 1;
  const c = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  ctx.filter = fxFilter(e.fx);
  ctx.drawImage(im, c.x * iw, c.y * ih, Math.max(1, c.w * iw), Math.max(1, c.h * ih), 0, 0, e.w, e.h);
  ctx.filter = 'none';
  ctx.restore();
  if (e.border) {
    ctx.lineWidth = e.border;
    ctx.strokeStyle = e.borderC ?? '#ffffff';
    const b = new Path2D();
    const k = e.border / 2;
    b.roundRect(k, k, e.w - e.border, e.h - e.border, Math.max(0, Math.min(e.radius ?? 0, e.w / 2, e.h / 2) - k));
    ctx.stroke(b);
  }
}

function drawShape(ctx: CanvasRenderingContext2D, e: El, env: Env) {
  const k = e.shape ?? 'rect';
  const p = shapePath(k, e.w, e.h, e.radius ?? 0);
  const sw = e.sw ?? 0;
  const line = isLine(k) || k === 'tick' || k === 'cross';
  if (!line && e.fill && e.fill !== 'none') {
    if (e.shadow) (ctx.shadowColor = 'rgba(38,36,32,0.25)'), (ctx.shadowBlur = 16), (ctx.shadowOffsetY = 5);
    ctx.fillStyle = e.fill;
    ctx.fill(p, 'nonzero');
    ctx.shadowColor = 'transparent';
  }
  if (sw > 0 || line) {
    ctx.lineWidth = line ? Math.max(1, sw || 4) : sw;
    ctx.strokeStyle = e.stroke ?? INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(e.dash === 'dash' ? [ctx.lineWidth * 3, ctx.lineWidth * 2] : e.dash === 'dot' ? [0.1, ctx.lineWidth * 2] : []);
    ctx.stroke(p);
    ctx.setLineDash([]);
    // Arrow heads.
    if (k === 'arrow' || k === 'double') {
      const a = Math.max(10, ctx.lineWidth * 3.2);
      ctx.fillStyle = e.stroke ?? INK;
      const head = (x: number, dir: number) => {
        ctx.beginPath();
        ctx.moveTo(x, e.h / 2);
        ctx.lineTo(x - dir * a, e.h / 2 - a * 0.6);
        ctx.lineTo(x - dir * a, e.h / 2 + a * 0.6);
        ctx.closePath();
        ctx.fill();
      };
      head(e.w, 1);
      if (k === 'double') head(0, -1);
    }
  }
  if (e.text && e.id !== env.skip && !line) drawText(ctx, e, textBox(e));
}

function drawPath(ctx: CanvasRenderingContext2D, e: El) {
  const pts = e.pts ?? [];
  const list: number[][] = [];
  for (let i = 0; i + 2 < pts.length; i += 3) list.push([pts[i] * e.w, pts[i + 1] * e.h, pts[i + 2]]);
  if (!list.length) return;
  const size = e.sw ?? 6;
  const stroke = getStroke(list, { size, thinning: e.pen === 'pen' ? 0.55 : 0, smoothing: 0.6, streamline: 0.45, simulatePressure: e.pen === 'pen' && list.every((p) => p[2] === 0.5), last: true });
  if (!stroke.length) return;
  const p = new Path2D();
  stroke.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  ctx.fillStyle = e.color ?? INK;
  if (e.pen === 'highlighter') {
    ctx.globalAlpha *= 0.42;
    ctx.globalCompositeOperation = 'multiply';
  }
  ctx.fill(p);
}

// The device-space box of the thing, to take what is under a cover.
function coverRegion(ctx: CanvasRenderingContext2D, e: El, grow: number) {
  const m = ctx.getTransform();
  const pts = [[0, 0], [e.w, 0], [e.w, e.h], [0, e.h]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - grow));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - grow));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...xs) + grow));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...ys) + grow));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), m };
}

function drawCover(ctx: CanvasRenderingContext2D, e: El, env: Env) {
  const mode = e.mode ?? 'blur';
  const clip = new Path2D();
  clip.roundRect(0, 0, e.w, e.h, Math.min(e.radius ?? 8, e.w / 2, e.h / 2));
  if (mode === 'solid' || mode === 'mystery') {
    ctx.fillStyle = mode === 'mystery' ? e.fill ?? env.accent : e.fill ?? '#ecebe7';
    ctx.fill(clip);
    if (mode === 'mystery') {
      const s = Math.min(e.w, e.h) * 0.62;
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${s}px Karla, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', e.w / 2, e.h / 2 + s * 0.04);
    }
    return;
  }
  const scale = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  const amount = e.amount ?? (mode === 'blur' ? 14 : 16);
  const r = coverRegion(ctx, e, mode === 'blur' ? amount * scale * 2 : 0);
  const tmp = document.createElement('canvas');
  tmp.width = r.w;
  tmp.height = r.h;
  const tg = tmp.getContext('2d')!;
  tg.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  ctx.save();
  ctx.clip(clip);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (mode === 'blur') {
    ctx.filter = `blur(${amount * scale}px)`;
    ctx.drawImage(tmp, r.x, r.y);
    ctx.filter = 'none';
  } else {
    const cell = Math.max(2, amount * scale);
    const sw = Math.max(1, Math.round(r.w / cell));
    const sh = Math.max(1, Math.round(r.h / cell));
    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    small.getContext('2d')!.drawImage(tmp, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, r.x, r.y, r.w, r.h);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.restore();
  if (env.editing) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(38,36,32,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke(clip);
    ctx.restore();
  }
}

// The number a label shows: its place among the page's labels, top to bottom, left to right.
export function labelNumbers(els: El[]) {
  const ls = els.filter((x) => x.t === 'label').sort((a, b) => (a.ay ?? a.y) - (b.ay ?? b.y) || (a.ax ?? a.x) - (b.ax ?? b.x) || a.id.localeCompare(b.id));
  return new Map(ls.map((l, i) => [l.id, i + 1]));
}

// A label's leader line runs from the point to the nearest side of its box.
export function labelEnd(e: El) {
  const ax = e.ax ?? e.x - 60;
  const ay = e.ay ?? e.y + e.h / 2;
  const cx = Math.max(e.x, Math.min(ax, e.x + e.w));
  const cy = Math.max(e.y, Math.min(ay, e.y + e.h));
  const inside = cx === ax && cy === ay;
  if (inside) return { x: e.x + e.w / 2, y: e.y + e.h / 2, ax, ay };
  // Snap to the middle of the side it meets, so lines look tidy.
  if (cx === e.x || cx === e.x + e.w) return { x: cx, y: Math.max(e.y + 8, Math.min(cy, e.y + e.h - 8)), ax, ay };
  return { x: Math.max(e.x + 12, Math.min(cx, e.x + e.w - 12)), y: cy, ax, ay };
}

function drawLabel(ctx: CanvasRenderingContext2D, e: El, env: Env, n: number) {
  // Drawn in page space (labels don't turn), from the page's origin.
  const accent = e.color && e.color !== INK ? e.color : env.accent;
  const end = labelEnd(e);
  const pin = e.pin ?? 'number';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(end.ax, end.ay);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  // The box.
  const r = Math.min(10, e.h / 2);
  ctx.fillStyle = e.fill ?? '#ffffff';
  ctx.beginPath();
  ctx.roundRect(e.x, e.y, e.w, e.h, r);
  ctx.fill();
  ctx.strokeStyle = e.stroke ?? accent;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  const chip = pin === 'number' ? Math.min(e.h - 10, 24) : 0;
  if (chip) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(e.x + 6 + chip / 2, e.y + e.h / 2, chip / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${chip * 0.56}px Karla, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), e.x + 6 + chip / 2, e.y + e.h / 2 + 0.5);
  }
  const box = { x: e.x + (chip ? chip + 12 : 10), y: e.y, w: e.w - (chip ? chip + 20 : 20), h: e.h };
  if (env.learner) {
    ctx.strokeStyle = '#a9a49d';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x + 2, e.y + e.h * 0.72);
    ctx.lineTo(box.x + box.w, e.y + e.h * 0.72);
    ctx.stroke();
  } else if (e.id !== env.skip) drawText(ctx, { ...e, valign: 'middle', align: e.align ?? 'left', color: e.color && e.color !== accent ? e.color : INK }, box);
  // The point.
  if (pin !== 'none') {
    const pr = pin === 'number' ? 13 : 6;
    ctx.fillStyle = accent;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(end.ax, end.ay, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (pin === 'number') {
      ctx.fillStyle = '#fff';
      ctx.font = `800 14px Karla, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), end.ax, end.ay + 0.5);
    }
  }
}

// Shuffled the same way every time, so a printout matches the screen.
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
export function bankWords(e: El, all: El[]) {
  const words = all.filter((x) => x.t === 'label' && x.page === e.page && (x.text ?? '').trim()).map((x) => (x.text ?? '').trim());
  const extra = (e.text ?? '').split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
  return [...words, ...extra].sort((a, b) => hash(a + e.id) - hash(b + e.id));
}

function drawBank(ctx: CanvasRenderingContext2D, e: El, env: Env) {
  const accent = env.accent;
  ctx.fillStyle = e.fill ?? '#ffffff';
  ctx.strokeStyle = e.stroke ?? HAIR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(0, 0, e.w, e.h, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = '800 12px Karla, sans-serif';
  (ctx as unknown as { letterSpacing: string }).letterSpacing = '1.6px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText((e.title ?? 'Word bank').toUpperCase(), 16, 20);
  (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
  const size = e.size ?? 18;
  ctx.font = fontOf({ font: e.font ?? 'Fraunces', size }, size);
  let x = 16;
  let y = 38;
  const ph = size * 1.8;
  for (const w of bankWords(e, env.all ?? [])) {
    const tw = ctx.measureText(w).width + size * 1.3;
    if (x + tw > e.w - 12 && x > 16) (x = 16), (y += ph + 8);
    if (y + ph > e.h - 6) break;
    ctx.beginPath();
    ctx.roundRect(x, y, tw, ph, ph / 2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = e.color ?? INK;
    ctx.textAlign = 'center';
    ctx.fillText(w, x + tw / 2, y + ph / 2 + 1);
    x += tw + 8;
  }
}

function drawQr(ctx: CanvasRenderingContext2D, e: El, env: Env) {
  const im = env.imgs.get('qr:' + (e.url ?? ''));
  const cap = e.text ? Math.min(28, e.h * 0.16) : 0;
  const s = Math.min(e.w, e.h - cap);
  const x = (e.w - s) / 2;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, 0, s, s, s * 0.08);
  ctx.fill();
  ctx.stroke();
  if (im) ctx.drawImage(im, x + s * 0.08, s * 0.08, s * 0.84, s * 0.84);
  else if (env.editing) {
    ctx.fillStyle = '#a9a49d';
    ctx.font = '600 13px Karla, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.url ? 'One moment…' : 'Add a link', e.w / 2, s / 2);
  }
  if (cap) {
    ctx.fillStyle = e.color ?? env.accent;
    ctx.font = `800 ${cap * 0.62}px Karla, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.text!, e.w / 2, s + cap * 0.6, e.w);
  }
}

function drawLines(ctx: CanvasRenderingContext2D, e: El) {
  const gap = e.gap ?? 28;
  ctx.strokeStyle = e.stroke ?? '#a9a49d';
  ctx.lineWidth = e.sw ?? 1;
  ctx.setLineDash(e.dash === 'dash' ? [6, 5] : e.dash === 'dot' ? [1, 4] : []);
  for (let y = gap; y <= e.h + 0.5; y += gap) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) - 0.5);
    ctx.lineTo(e.w, Math.round(y) - 0.5);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export function drawEl(ctx: CanvasRenderingContext2D, e: El, env: Env, nums: Map<string, number>) {
  ctx.save();
  ctx.globalAlpha = e.opacity ?? 1;
  if (e.t === 'label') {
    drawLabel(ctx, e, env, nums.get(e.id) ?? 1);
    ctx.restore();
    return;
  }
  ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
  if (e.rot) ctx.rotate((e.rot * Math.PI) / 180);
  if (e.flipX || e.flipY) ctx.scale(e.flipX ? -1 : 1, e.flipY ? -1 : 1);
  ctx.translate(-e.w / 2, -e.h / 2);
  switch (e.t) {
    case 'image':
      drawPicture(ctx, e, env);
      break;
    case 'text':
      if (e.id !== env.skip) drawText(ctx, e, { x: 0, y: 0, w: e.w, h: e.h });
      break;
    case 'shape':
      drawShape(ctx, e, env);
      break;
    case 'path':
      drawPath(ctx, e);
      break;
    case 'art': {
      const im = env.imgs.get(artKey(e, env.accent));
      if (im) ctx.drawImage(im, 0, 0, e.w, e.h);
      break;
    }
    case 'cover':
      drawCover(ctx, e, env);
      break;
    case 'wordbank':
      drawBank(ctx, e, env);
      break;
    case 'qr':
      drawQr(ctx, e, env);
      break;
    case 'lines':
      drawLines(ctx, e);
      break;
  }
  ctx.restore();
}

// The whole page, at a scale (device pixels per page pixel), from (ox, oy).
export function drawPage(ctx: CanvasRenderingContext2D, page: DPage, els: El[], env: Env, scale: number, ox = 0, oy = 0) {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.fillStyle = page.bg || '#ffffff';
  ctx.fillRect(0, 0, page.w, page.h);
  ctx.beginPath();
  ctx.rect(0, 0, page.w, page.h);
  ctx.clip();
  const mine = els.filter((e) => e.page === page.id).sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
  const shown = mine.filter((e) => visible(e, env.view));
  const nums = labelNumbers(shown);
  const all = { ...env, page, all: shown };
  for (const e of shown) drawEl(ctx, e, all, nums);
  ctx.restore();
}

// A page as a picture: for downloads, printing and Files.
export function pageCanvas(page: DPage, els: El[], env: Env, scale = 2) {
  const c = document.createElement('canvas');
  c.width = Math.round(page.w * scale);
  c.height = Math.round(page.h * scale);
  drawPage(c.getContext('2d')!, page, els, { ...env, editing: false, skip: undefined }, scale);
  return c;
}

// The box a thing covers on the page, turned with it: for picking things and drawing handles.
export function corners(e: El): [number, number][] {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const a = ((e.t === 'label' ? 0 : e.rot ?? 0) * Math.PI) / 180;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const dx = (sx * e.w) / 2;
    const dy = (sy * e.h) / 2;
    return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
  });
}
export function hit(e: El, x: number, y: number, pad = 0) {
  if (e.t === 'label' && e.ax != null && Math.hypot(x - e.ax, y - (e.ay ?? 0)) < 16 + pad) return true;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const a = (-(e.t === 'label' ? 0 : e.rot ?? 0) * Math.PI) / 180;
  const dx = (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a);
  const dy = (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
  const ex = isLine(e.shape) && e.t === 'shape' ? Math.max(pad, 10) : pad;
  return Math.abs(dx) <= e.w / 2 + ex && Math.abs(dy) <= e.h / 2 + ex;
}
export function bounds(list: El[]) {
  const ps = list.flatMap(corners);
  const xs = ps.map((p) => p[0]);
  const ys = ps.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

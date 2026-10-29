import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { isLearnerEmail } from '../lib/learners';
import { newId } from '../lib/tasks';
import { ask, tell } from '../lib/ask';
import type { SharedDoc } from '../lib/sharedDocs';
import { openMenu, type MenuItem } from '../components/ContextMenu';
import { UiIcon } from '../components/UiIcon';
import { clean, elsCol, ensureFont, loadPicture, pagesCol, saveMeta, storePicture, useDesign, type DPage, type El } from './model';
import { artKey, bounds, corners, drawPage, hit, isLine, labelEnd, textBox, textHeight, type View } from './render';
import { artImage, qrImage } from './assets';
import { useEdits } from './useHistory';
import type { Tpl } from './templates';
import { Drawer, type DrawerKey } from './Drawers';
import { Props } from './Panels';
import { StartScreen } from './Start';
import { eraseFrom, pagePointToImage } from './tools';
import { DownloadMenu } from './Download';
import './design.css';

export type Tool = 'select' | 'hand' | 'pen' | 'marker' | 'highlighter' | 'eraser' | 'label' | 'magic' | 'crop';

export type Ctx = {
  d: SharedDoc;
  canEdit: boolean;
  page: DPage;
  pages: DPage[];
  els: El[]; // everything, with changes being made
  here: El[]; // on this page
  sel: El[];
  select: (ids: string[]) => void;
  accent: string;
  setAccent: (c: string) => void;
  add: (list: Partial<El>[], o?: { select?: boolean; edit?: boolean }) => string[];
  patch: (patches: Record<string, Partial<El>>, key?: string) => void;
  setLive: (patches: Record<string, Partial<El>>, saveAfter?: number, key?: string) => void;
  remove: (ids: string[]) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  pen: { color: string; size: number };
  setPen: (p: { color: string; size: number }) => void;
  addPicture: (f: Blob, o?: { into?: string; credit?: string; name?: string }) => Promise<void>;
  imgs: Map<string, CanvasImageSource>;
  setPage: (p: Partial<DPage>) => void;
  addPages: (tpl: Tpl, replace?: boolean) => Promise<void>;
  editText: (id: string) => void;
  view: View;
  zIndex: (dir: 'up' | 'down' | 'top' | 'bottom') => void;
  align: (how: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hdist' | 'vdist') => void;
  duplicate: () => void;
  goPage: (id: string) => void;
  spot: (w: number, h: number) => { x: number; y: number; w: number; h: number };
  learnerUser: boolean;
};

const SNAP = 6;
const HANDLES: [number, number][] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const keepRatio = (e: El) => e.t === 'image' || e.t === 'art' || e.t === 'qr' || (e.t === 'shape' && (e.shape === 'star' || e.shape === 'heart'));

export function DesignFile({ d, canEdit }: { d: SharedDoc; canEdit: boolean }) {
  const { pages, els: server, meta } = useDesign(d.id);
  const edits = useEdits(d.id, server);
  const { live, setLive, flush, commit, patch } = edits;
  const els = useMemo(() => server.map((e) => (live[e.id] ? { ...e, ...live[e.id] } : e)), [server, live]);
  const [pageId, setPageId] = useState('');
  const page = pages?.find((p) => p.id === pageId) ?? pages?.[0];
  const here = useMemo(() => els.filter((e) => e.page === page?.id).sort((a, b) => a.z - b.z || a.id.localeCompare(b.id)), [els, page?.id]);
  const [selIds, setSelIds] = useState<string[]>([]);
  const sel = useMemo(() => selIds.map((id) => here.find((e) => e.id === id)).filter((e): e is El => !!e), [selIds, here]);
  const [tool, setTool] = useState<Tool>('select');
  const [pen, setPen] = useState({ color: '#262420', size: 6 });
  // On a phone the tools sit along the bottom and open as sheets over the page.
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 860px)');
    const f = () => setPhone(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  const [drawer, setDrawer] = useState<DrawerKey | null>(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches ? null : 'templates'));
  const [propsOpen, setPropsOpen] = useState(false);
  const [hover, setHover] = useState('');
  const frameIn = useRef<HTMLInputElement>(null);
  const frameFor = useRef('');
  const [view, setView] = useState<View>('all');
  const [learner, setLearner] = useState(false);
  const [editing, setEditing] = useState('');
  const [zoom, setZoom] = useState(0.6);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [stroke, setStroke] = useState<number[] | null>(null);
  const [cropOf, setCropOf] = useState('');
  const accent = meta.accent ?? '#c8764a';
  const [fontTick, setFontTick] = useState(0);

  // Pictures, people and things, and QR codes, loaded as they're needed.
  const [imgs, setImgs] = useState<Map<string, CanvasImageSource>>(() => new Map());
  useEffect(() => {
    const need: [string, () => Promise<CanvasImageSource>][] = [];
    for (const e of els) {
      if (e.t === 'image' && e.img && !imgs.has(e.img)) need.push([e.img, () => loadPicture(d.id, e.img!)]);
      if (e.t === 'art') {
        const k = artKey(e, accent);
        if (!imgs.has(k)) need.push([k, () => artImage(e, accent)]);
      }
      if (e.t === 'qr' && e.url && !imgs.has('qr:' + e.url)) need.push(['qr:' + e.url, () => qrImage(e.url!)]);
    }
    const uniq = [...new Map(need).entries()];
    if (!uniq.length) return;
    let on = true;
    void Promise.all(uniq.map(([k, f]) => f().then((im) => [k, im] as const, () => null))).then((got) => {
      if (!on) return;
      setImgs((m) => {
        const n = new Map(m);
        for (const g of got) if (g) n.set(g[0], g[1]);
        return n;
      });
    });
    return () => void (on = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [els, accent, d.id]);
  // Fonts on the page, before drawing with them.
  const fonts = useMemo(() => [...new Set(els.map((e) => e.font).filter(Boolean) as string[])].sort().join('|'), [els]);
  useEffect(() => {
    void Promise.all(fonts.split('|').filter(Boolean).map(ensureFont)).then(() => setFontTick((n) => n + 1));
  }, [fonts]);

  // ------------------------------------------------------------------ changes

  const add = useCallback(
    (list: Partial<El>[], o: { select?: boolean; edit?: boolean } = {}) => {
      if (!page) return [];
      let z = Math.max(0, ...here.map((e) => e.z)) + 1;
      const after: Record<string, El> = {};
      const ids: string[] = [];
      for (const p of list) {
        const id = newId() + newId();
        ids.push(id);
        const e = { x: 100, y: 100, w: 200, h: 120, ...p, id, page: p.page ?? page.id, z: z++ } as El;
        // Something new never lands exactly on top of something else: it steps down and right.
        if (list.length === 1 && e.t !== 'label')
          for (let k = 0; k < 30 && here.some((o) => Math.abs(o.x - e.x) < 3 && Math.abs(o.y - e.y) < 3); k++) (e.x += 24), (e.y += 24);
        after[id] = clean(e);
      }
      commit(after);
      if (o.select !== false) setSelIds(ids);
      if (o.edit && ids.length === 1) setTimeout(() => setEditing(ids[0]), 30);
      setTool('select');
      return ids;
    },
    [page, here, commit],
  );
  const remove = useCallback(
    (ids: string[]) => {
      const after: Record<string, null> = {};
      for (const id of ids) after[id] = null;
      commit(after);
      setSelIds((s) => s.filter((x) => !ids.includes(x)));
    },
    [commit],
  );

  // A picture added: stored in the file, and put in the frame chosen, the frame selected, or the middle.
  const addPicture = useCallback(
    async (f: Blob, o: { into?: string; credit?: string; name?: string } = {}) => {
      if (!page) return;
      try {
        const { id, w, h } = await storePicture(d.id, f);
        const frame = o.into ? here.find((e) => e.id === o.into) : sel.length === 1 && sel[0].t === 'image' && !sel[0].img ? sel[0] : undefined;
        if (frame) {
          // Fill the frame, cut to its shape from the middle.
          const fr = frame.w / frame.h;
          const ir = w / h;
          const crop = ir > fr ? { x: (1 - fr / ir) / 2, y: 0, w: fr / ir, h: 1 } : { x: 0, y: (1 - ir / fr) / 2, w: 1, h: ir / fr };
          patch({ [frame.id]: { img: id, iw: w, ih: h, crop, credit: o.credit, name: o.name ?? frame.name } });
          setSelIds([frame.id]);
          return;
        }
        const s = Math.min(1, (page.w * 0.7) / w, (page.h * 0.6) / h);
        add([{ t: 'image', img: id, iw: w, ih: h, w: Math.round(w * s), h: Math.round(h * s), x: Math.round((page.w - w * s) / 2), y: Math.round((page.h - h * s) / 2), credit: o.credit, name: o.name }]);
      } catch {
        void tell('We couldn’t add that picture. Try a smaller one, or a different kind of file.');
      }
    },
    [page, here, sel, d.id, patch, add],
  );

  const setPageP = useCallback((p: Partial<DPage>) => page && void updateDoc(doc(pagesCol(d.id), page.id), clean(p)).catch(() => {}), [page, d.id]);

  const addPages = useCallback(
    async (tpl: Tpl, replace = false) => {
      const at = replace ? 0 : (page?.order ?? (pages?.length ?? 0) - 1) + 0.5;
      const b = writeBatch(db);
      const made: string[] = [];
      tpl.pages.forEach((tp, i) => {
        const pid = newId() + newId();
        made.push(pid);
        b.set(doc(pagesCol(d.id), pid), clean({ ...tp.p, order: at + i * 0.01 }));
        tp.els.forEach((e, k) => b.set(doc(elsCol(d.id), newId() + newId()), clean({ ...e, page: pid, z: k + 1 })));
      });
      const gone = replace && pages?.length === 1 && !server.some((e) => e.page === pages[0].id) ? pages[0].id : '';
      if (gone) b.delete(doc(pagesCol(d.id), gone));
      await b.commit();
      // Pages numbered in order again.
      const all = [...(pages ?? []).filter((x) => x.id !== gone), ...made.map((id, i) => ({ id, order: at + i * 0.01 }) as DPage)].sort((x, y) => x.order - y.order);
      const b2 = writeBatch(db);
      all.forEach((p, i) => b2.update(doc(pagesCol(d.id), p.id), { order: i }));
      await b2.commit().catch(() => {});
      setPageId(made[0]);
      setSelIds([]);
    },
    [page, pages, server, d.id],
  );

  const zIndex = useCallback(
    (dir: 'up' | 'down' | 'top' | 'bottom') => {
      if (!sel.length) return;
      const ids = new Set(sel.map((e) => e.id));
      const rest = here.filter((e) => !ids.has(e.id));
      const mine = here.filter((e) => ids.has(e.id));
      let order: El[];
      if (dir === 'top') order = [...rest, ...mine];
      else if (dir === 'bottom') order = [...mine, ...rest];
      else {
        order = [...here];
        const idx = order.map((e, i) => (ids.has(e.id) ? i : -1)).filter((i) => i >= 0);
        if (dir === 'up') for (const i of idx.reverse()) i < order.length - 1 && !ids.has(order[i + 1].id) && ([order[i], order[i + 1]] = [order[i + 1], order[i]]);
        else for (const i of idx) i > 0 && !ids.has(order[i - 1].id) && ([order[i], order[i - 1]] = [order[i - 1], order[i]]);
      }
      const p: Record<string, Partial<El>> = {};
      order.forEach((e, i) => e.z !== i + 1 && (p[e.id] = { z: i + 1 }));
      patch(p);
    },
    [sel, here, patch],
  );

  const align = useCallback(
    (how: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hdist' | 'vdist') => {
      if (!page || !sel.length) return;
      const box = sel.length === 1 ? { x: 0, y: 0, w: page.w, h: page.h } : bounds(sel);
      const p: Record<string, Partial<El>> = {};
      if (how === 'hdist' || how === 'vdist') {
        const h = how === 'hdist';
        const list = [...sel].sort((a, b) => (h ? a.x - b.x : a.y - b.y));
        const total = list.reduce((s, e) => s + (h ? e.w : e.h), 0);
        const gap = ((h ? box.w : box.h) - total) / Math.max(1, list.length - 1);
        let at = h ? box.x : box.y;
        for (const e of list) (p[e.id] = h ? { x: Math.round(at) } : { y: Math.round(at) }), (at += (h ? e.w : e.h) + gap);
      } else
        for (const e of sel) {
          const b = bounds([e]);
          const dx = how === 'left' ? box.x - b.x : how === 'center' ? box.x + box.w / 2 - (b.x + b.w / 2) : how === 'right' ? box.x + box.w - (b.x + b.w) : 0;
          const dy = how === 'top' ? box.y - b.y : how === 'middle' ? box.y + box.h / 2 - (b.y + b.h / 2) : how === 'bottom' ? box.y + box.h - (b.y + b.h) : 0;
          p[e.id] = { x: Math.round(e.x + dx), y: Math.round(e.y + dy), ...(e.t === 'label' ? { ax: (e.ax ?? 0) + dx, ay: (e.ay ?? 0) + dy } : {}) };
        }
      patch(p);
    },
    [page, sel, patch],
  );

  const clip = useRef<El[]>([]);
  // Copying writes a marker to the clipboard, so pasting knows whether to paste things from here or
  // text from somewhere else.
  const MARK = '\u2063eltsuite-design\u2063';
  const copy = (list: El[]) => {
    clip.current = list;
    void navigator.clipboard?.writeText(MARK).catch(() => {});
  };
  const pasteClip = () => {
    if (!clip.current.length) return;
    add(clip.current.map(({ id: _i, z: _z, ...x }) => ({ ...x, page: undefined, x: x.x + 24, y: x.y + 24, ...(x.t === 'label' ? { ax: (x.ax ?? 0) + 24, ay: (x.ay ?? 0) + 24 } : {}) })));
  };
  const duplicate = useCallback(() => {
    if (!sel.length) return;
    add(sel.map(({ id: _id, z: _z, ...e }) => ({ ...e, x: e.x + 24, y: e.y + 24, ...(e.t === 'label' ? { ax: (e.ax ?? 0) + 24, ay: (e.ay ?? 0) + 24 } : {}) })));
  }, [sel, add]);

  // ------------------------------------------------------------------ the stage

  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const PAD = phone ? 16 : 56;
  const fit = useCallback(() => {
    const s = scroller.current;
    if (!s || !page) return;
    setZoom(Math.max(0.08, Math.min(2, Math.min((s.clientWidth - PAD * 2) / page.w, (s.clientHeight - PAD * 2) / page.h))));
  }, [page, PAD]);
  useLayoutEffect(() => fit(), [page?.id, page?.w, page?.h, phone ? 0 : drawer === null, phone]); // eslint-disable-line react-hooks/exhaustive-deps
  // Where something new goes: the middle of the part of the page you can see.
  const spot = useCallback(
    (w: number, h: number) => {
      const s = scroller.current;
      const c = canvas.current;
      if (!page) return { x: 0, y: 0, w, h };
      let cx = page.w / 2;
      let cy = page.h / 2;
      if (s && c) {
        const r = c.getBoundingClientRect();
        const sr = s.getBoundingClientRect();
        cx = (sr.left + sr.width / 2 - r.left) / zoom;
        cy = (sr.top + sr.height / 2 - r.top) / zoom;
      }
      const x = Math.round(Math.max(0, Math.min(page.w - w, cx - w / 2)));
      const y = Math.round(Math.max(0, Math.min(page.h - h, cy - h / 2)));
      return { x, y, w, h };
    },
    [page, zoom],
  );
  useEffect(() => {
    const f = () => fit();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [fit]);

  const tmpStroke = useMemo<El | null>(() => {
    if (!stroke || !page || stroke.length < 3) return null;
    return { id: '_stroke', page: page.id, t: 'path', z: 1e9, x: 0, y: 0, w: page.w, h: page.h, pts: stroke.map((v, i) => (i % 3 === 0 ? v / page.w : i % 3 === 1 ? v / page.h : v)), sw: pen.size, color: pen.color, pen: tool === 'highlighter' ? 'highlighter' : tool === 'marker' ? 'marker' : 'pen' };
  }, [stroke, page, pen, tool]);

  // Drawn again whenever anything changes, once a frame.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !page) return;
    const id = requestAnimationFrame(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let k = zoom * dpr;
      if (page.w * k * page.h * k > 14e6) k = Math.sqrt(14e6 / (page.w * page.h));
      const W = Math.round(page.w * k);
      const H = Math.round(page.h * k);
      if (c.width !== W || c.height !== H) (c.width = W), (c.height = H);
      const g = c.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      const list = tmpStroke ? [...here, tmpStroke] : here;
      drawPage(g, page, cropOf ? list.map((e) => (e.id === cropOf ? { ...e, hidden: true } : e)) : list, { imgs, view, learner, accent, editing: true, skip: editing }, k);
    });
    return () => cancelAnimationFrame(id);
  }, [page, here, imgs, view, learner, accent, editing, zoom, tmpStroke, fontTick, cropOf]);

  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };
  const shown = useMemo(() => here.filter((e) => !e.hidden && !(view === 'A' && e.ver === 'B') && !(view === 'B' && e.ver === 'A')), [here, view]);
  useEffect(() => setSelIds((ids) => ids.filter((id) => shown.some((e) => e.id === id))), [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const topAt = (x: number, y: number) => [...shown].reverse().find((e) => hit(e, x, y, 3 / zoom));

  // Snapping to the page's edges and middle, and to other things' edges and middles.
  const snap = (b: { x: number; y: number; w: number; h: number }, skip: Set<string>, alt: boolean) => {
    if (!page || alt) return { dx: 0, dy: 0, gx: [] as number[], gy: [] as number[] };
    const xs = [0, page.w / 2, page.w];
    const ys = [0, page.h / 2, page.h];
    for (const e of shown)
      if (!skip.has(e.id)) {
        const o = bounds([e]);
        xs.push(o.x, o.x + o.w / 2, o.x + o.w);
        ys.push(o.y, o.y + o.h / 2, o.y + o.h);
      }
    const t = SNAP / zoom;
    const best = (vals: number[], cands: number[]) => {
      let d = Infinity;
      let at = 0;
      for (const v of vals) for (const c of cands) if (Math.abs(c - v) < Math.abs(d)) (d = c - v), (at = c);
      return Math.abs(d) <= t ? { d, at } : null;
    };
    const bx = best([b.x, b.x + b.w / 2, b.x + b.w], xs);
    const by = best([b.y, b.y + b.h / 2, b.y + b.h], ys);
    return { dx: bx?.d ?? 0, dy: by?.d ?? 0, gx: bx ? [bx.at] : [], gy: by ? [by.at] : [] };
  };

  type Drag =
    | { k: 'move'; x0: number; y0: number; start: El[]; alt: boolean }
    | { k: 'resize'; hx: number; hy: number; start: El; group?: { start: El[]; box: { x: number; y: number; w: number; h: number } } }
    | { k: 'rotate'; start: El; cx: number; cy: number }
    | { k: 'anchor'; start: El }
    | { k: 'marquee'; x0: number; y0: number; add: string[] }
    | { k: 'pan'; sx: number; sy: number; l: number; t: number }
    | { k: 'draw' }
    | { k: 'erase' }
    | { k: 'crop'; mode: 'pan' | 'size'; hx: number; hy: number; start: El; x0: number; y0: number };
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  // Two fingers: pinch to zoom and move around, on a phone or a tablet.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number; mx: number; my: number; l: number; t: number } | null>(null);
  const touchDown = (ev: RPE<HTMLDivElement>) => {
    if (ev.pointerType !== 'touch') return false;
    touches.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      const s = scroller.current!;
      // A second finger stops whatever the first one began.
      if (drag.current?.k === 'move' || drag.current?.k === 'resize' || drag.current?.k === 'rotate') setLive(Object.fromEntries(sel.map((e) => [e.id, { x: e.x, y: e.y, w: e.w, h: e.h, rot: e.rot }])));
      drag.current = null;
      setStroke(null);
      setMarquee(null);
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, l: s.scrollLeft, t: s.scrollTop };
      return true;
    }
    return false;
  };
  const touchMove = (ev: RPE<HTMLDivElement>) => {
    if (ev.pointerType !== 'touch' || !touches.current.has(ev.pointerId)) return false;
    touches.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const pc = pinch.current;
    if (!pc || touches.current.size < 2) return false;
    const [a, b] = [...touches.current.values()];
    const z = Math.max(0.08, Math.min(5, (pc.z * Math.hypot(a.x - b.x, a.y - b.y)) / pc.d));
    setZoom(z);
    const s = scroller.current!;
    s.scrollLeft = pc.l * (z / pc.z) - ((a.x + b.x) / 2 - pc.mx);
    s.scrollTop = pc.t * (z / pc.z) - ((a.y + b.y) / 2 - pc.my);
    return true;
  };
  const touchUp = (ev: RPE<HTMLDivElement>) => {
    touches.current.delete(ev.pointerId);
    if (touches.current.size < 2 && pinch.current) {
      pinch.current = null;
      return true;
    }
    return false;
  };

  const begin = (ev: RPE<HTMLDivElement>, k: Drag) => {
    drag.current = k;
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
  };

  const onDown = (ev: RPE<HTMLDivElement>) => {
    if (!page || ev.button === 2) return;
    if (touchDown(ev)) return;
    if (editing) {
      setEditing('');
      flush('text');
    }
    const p = toPage(ev);
    if (ev.button === 1 || tool === 'hand' || space.current) {
      const s = scroller.current!;
      return begin(ev, { k: 'pan', sx: ev.clientX, sy: ev.clientY, l: s.scrollLeft, t: s.scrollTop });
    }
    if (!canEdit) return;
    if (tool === 'pen' || tool === 'marker' || tool === 'highlighter') {
      setStroke([p.x, p.y, ev.pressure || 0.5]);
      return begin(ev, { k: 'draw' });
    }
    if (tool === 'eraser') {
      const t = [...shown].reverse().find((e) => e.t === 'path' && hit(e, p.x, p.y, 6));
      if (t) remove([t.id]);
      return begin(ev, { k: 'erase' });
    }
    if (tool === 'label') {
      const right = p.x < page.w - 220;
      add([{ t: 'label', text: 'word', ax: p.x, ay: p.y, x: right ? p.x + 70 : p.x - 230, y: p.y - 20, w: 160, h: 40, font: 'Fraunces', size: 18 }], { edit: true });
      return;
    }
    if (tool === 'magic') {
      const t = [...shown].reverse().find((e) => e.t === 'image' && e.img && hit(e, p.x, p.y));
      if (!t) return void tell('Click on a picture to take away the colour you click on.');
      void (async () => {
        const im = imgs.get(t.img!) as HTMLImageElement | undefined;
        if (!im) return;
        const at = pagePointToImage(t, p.x, p.y, im.naturalWidth, im.naturalHeight);
        const out = eraseFrom(im, at.x, at.y, 34, ev.shiftKey);
        const blob = await new Promise<Blob>((r) => out.toBlob((b) => r(b!), 'image/png'));
        try {
          const s = await storePicture(d.id, blob);
          patch({ [t.id]: { img: s.id, iw: s.w, ih: s.h } });
        } catch {
          void tell('We couldn’t change that picture. Try a smaller one.');
        }
      })();
      return;
    }
    if (tool === 'crop') return;
    const t = topAt(p.x, p.y);
    if (!t) {
      setSelIds(ev.shiftKey ? selIds : []);
      // A finger on an empty part of the page moves around; a mouse draws a box to select.
      if (ev.pointerType === 'touch') {
        const sc = scroller.current!;
        return begin(ev, { k: 'pan', sx: ev.clientX, sy: ev.clientY, l: sc.scrollLeft, t: sc.scrollTop });
      }
      return begin(ev, { k: 'marquee', x0: p.x, y0: p.y, add: ev.shiftKey ? selIds : [] });
    }
    let ids = selIds;
    if (ev.shiftKey) ids = selIds.includes(t.id) ? selIds.filter((x) => x !== t.id) : [...selIds, t.id];
    else if (!selIds.includes(t.id)) ids = [t.id];
    setSelIds(ids);
    const start = here.filter((e) => ids.includes(e.id) && !e.locked);
    if (ev.altKey && start.length && !ev.shiftKey) {
      // Alt-drag leaves a copy behind.
      add(start.map(({ id: _i, z: _z, ...e }) => e), { select: false });
    }
    if (start.length) begin(ev, { k: 'move', x0: p.x, y0: p.y, start, alt: false });
  };

  const onMove = (ev: RPE<HTMLDivElement>) => {
    if (touchMove(ev)) return;
    const g = drag.current;
    if (!g && page && ev.pointerType === 'mouse' && tool === 'select') {
      const p = toPage(ev);
      const t = topAt(p.x, p.y);
      if ((t?.id ?? '') !== hover) setHover(t?.id ?? '');
    }
    if (!g || !page) return;
    if (g.k === 'pan') {
      const s = scroller.current!;
      s.scrollLeft = g.l - (ev.clientX - g.sx);
      s.scrollTop = g.t - (ev.clientY - g.sy);
      return;
    }
    const p = toPage(ev);
    if (g.k === 'draw') return setStroke((s) => (s ? [...s, p.x, p.y, ev.pressure || 0.5] : s));
    if (g.k === 'erase') {
      const t = [...shown].reverse().find((e) => e.t === 'path' && hit(e, p.x, p.y, 6));
      if (t) remove([t.id]);
      return;
    }
    if (g.k === 'marquee') {
      const r = { x: Math.min(g.x0, p.x), y: Math.min(g.y0, p.y), w: Math.abs(p.x - g.x0), h: Math.abs(p.y - g.y0) };
      setMarquee(r);
      const inside = shown.filter((e) => {
        const b = bounds([e]);
        return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y;
      });
      setSelIds([...new Set([...g.add, ...inside.map((e) => e.id)])]);
      return;
    }
    if (g.k === 'move') {
      let dx = p.x - g.x0;
      let dy = p.y - g.y0;
      if (ev.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      const b = bounds(g.start);
      const s = snap({ ...b, x: b.x + dx, y: b.y + dy }, new Set(g.start.map((e) => e.id)), ev.altKey && ev.metaKey);
      dx += s.dx;
      dy += s.dy;
      setGuides({ x: s.gx, y: s.gy });
      const ps: Record<string, Partial<El>> = {};
      for (const e of g.start) ps[e.id] = { x: Math.round(e.x + dx), y: Math.round(e.y + dy), ...(e.t === 'label' ? { ax: (e.ax ?? 0) + dx, ay: (e.ay ?? 0) + dy } : {}) };
      setLive(ps);
      return;
    }
    if (g.k === 'anchor') return setLive({ [g.start.id]: { ax: Math.round(p.x), ay: Math.round(p.y) } });
    if (g.k === 'rotate') {
      let a = (Math.atan2(p.y - g.cy, p.x - g.cx) * 180) / Math.PI + 90;
      if (ev.shiftKey) a = Math.round(a / 15) * 15;
      else for (const q of [0, 90, 180, 270, 360, -90]) if (Math.abs(a - q) < 4) a = q;
      a = ((a % 360) + 360) % 360;
      return setLive({ [g.start.id]: { rot: Math.round(a * 10) / 10 } });
    }
    if (g.k === 'resize' && g.group) {
      const { box, start } = g.group;
      const fx = g.hx < 0 ? box.x + box.w : box.x;
      const fy = g.hy < 0 ? box.y + box.h : box.y;
      let sx = g.hx ? Math.max(0.05, (g.hx * (p.x - fx)) / box.w) : 1;
      let sy = g.hy ? Math.max(0.05, (g.hy * (p.y - fy)) / box.h) : 1;
      if (g.hx && g.hy) sx = sy = Math.max(sx, sy);
      const ps: Record<string, Partial<El>> = {};
      for (const e of start) {
        const nx = fx + (e.x - fx) * sx;
        const ny = fy + (e.y - fy) * sy;
        ps[e.id] = { x: Math.round(nx), y: Math.round(ny), w: Math.max(4, Math.round(e.w * sx)), h: Math.max(4, Math.round(e.h * sy)), ...(e.t === 'text' && g.hx && g.hy ? { size: Math.round((e.size ?? 22) * sx * 10) / 10 } : {}), ...(e.t === 'label' ? { ax: fx + ((e.ax ?? 0) - fx) * sx, ay: fy + ((e.ay ?? 0) - fy) * sy } : {}) };
      }
      return setLive(ps);
    }
    if (g.k === 'resize') {
      const e = g.start;
      const a = ((e.t === 'label' ? 0 : e.rot ?? 0) * Math.PI) / 180;
      const u = [Math.cos(a), Math.sin(a)];
      const v = [-Math.sin(a), Math.cos(a)];
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const F = [cx - u[0] * (g.hx * e.w) / 2 - v[0] * (g.hy * e.h) / 2, cy - u[1] * (g.hx * e.w) / 2 - v[1] * (g.hy * e.h) / 2];
      const d0 = [p.x - F[0], p.y - F[1]];
      const lu = d0[0] * u[0] + d0[1] * u[1];
      const lv = d0[0] * v[0] + d0[1] * v[1];
      const min = 8;
      let w = g.hx ? Math.max(min, g.hx * lu) : e.w;
      let h = g.hy ? Math.max(min, g.hy * lv) : e.h;
      const corner = g.hx && g.hy;
      const textLike = e.t === 'text';
      if (corner && (keepRatio(e) !== ev.shiftKey || textLike)) {
        const k = Math.max(w / e.w, h / e.h);
        w = e.w * k;
        h = e.h * k;
      }
      let extra: Partial<El> = {};
      if (textLike) {
        if (corner) extra = { size: Math.max(4, Math.round((e.size ?? 22) * (w / e.w) * 10) / 10) };
        h = textHeight({ ...e, ...extra }, w);
      }
      const ncx = F[0] + u[0] * (g.hx * w) / 2 + v[0] * (g.hy * (textLike ? e.h : h)) / 2;
      const ncy = F[1] + u[1] * (g.hx * w) / 2 + v[1] * (g.hy * (textLike ? e.h : h)) / 2;
      const top = textLike ? e.y : ncy - h / 2;
      return setLive({ [e.id]: { x: Math.round(ncx - w / 2), y: Math.round(top), w: Math.round(w), h: Math.round(h), ...extra } });
    }
    if (g.k === 'crop') {
      const e = g.start;
      const im = imgs.get(e.img ?? '') as HTMLImageElement | undefined;
      if (!im) return;
      const c = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
      const k = e.w / (c.w * im.naturalWidth);
      const full = { x: e.x - c.x * im.naturalWidth * k, y: e.y - c.y * im.naturalHeight * k, w: im.naturalWidth * k, h: im.naturalHeight * k };
      const dx = p.x - g.x0;
      const dy = p.y - g.y0;
      if (g.mode === 'pan') {
        // The picture moves under the frame, and always covers it.
        const nx = Math.min(e.x, Math.max(e.x + e.w - full.w, full.x + dx));
        const ny = Math.min(e.y, Math.max(e.y + e.h - full.h, full.y + dy));
        return setLive({ [e.id]: { crop: { x: (e.x - nx) / full.w, y: (e.y - ny) / full.h, w: e.w / full.w, h: e.h / full.h } } });
      }
      let x0 = e.x;
      let y0 = e.y;
      let x1 = e.x + e.w;
      let y1 = e.y + e.h;
      if (g.hx < 0) x0 = Math.max(full.x, Math.min(x1 - 20, e.x + dx));
      if (g.hx > 0) x1 = Math.min(full.x + full.w, Math.max(x0 + 20, x1 + dx));
      if (g.hy < 0) y0 = Math.max(full.y, Math.min(y1 - 20, e.y + dy));
      if (g.hy > 0) y1 = Math.min(full.y + full.h, Math.max(y0 + 20, y1 + dy));
      return setLive({ [e.id]: { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0), crop: { x: (x0 - full.x) / full.w, y: (y0 - full.y) / full.h, w: (x1 - x0) / full.w, h: (y1 - y0) / full.h } } });
    }
  };

  const onUp = (ev?: RPE<HTMLDivElement>) => {
    if (ev && touchUp(ev)) return;
    const g = drag.current;
    drag.current = null;
    setGuides({ x: [], y: [] });
    setMarquee(null);
    if (!g || !page) return;
    if (g.k === 'draw' && stroke) {
      const s = stroke;
      setStroke(null);
      if (s.length < 6) return;
      const xs = s.filter((_, i) => i % 3 === 0);
      const ys = s.filter((_, i) => i % 3 === 1);
      const pad = pen.size;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      const w = Math.max(...xs) + pad - x;
      const h = Math.max(...ys) + pad - y;
      const pts = s.map((v, i) => Math.round((i % 3 === 0 ? (v - x) / w : i % 3 === 1 ? (v - y) / h : v) * 10000) / 10000);
      add([{ t: 'path', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), pts, sw: pen.size, color: pen.color, pen: tool === 'highlighter' ? 'highlighter' : tool === 'marker' ? 'marker' : 'pen' }], { select: false });
      setTool(tool);
      return;
    }
    if (g.k === 'move' || g.k === 'resize' || g.k === 'rotate' || g.k === 'anchor' || g.k === 'crop') flush();
  };

  const startHandle = (ev: RPE<HTMLElement>, hx: number, hy: number) => {
    ev.stopPropagation();
    if (!canEdit) return;
    const box = ev.currentTarget.closest('.dz-over') as HTMLDivElement;
    drag.current = sel.length > 1 ? { k: 'resize', hx, hy, start: sel[0], group: { start: sel, box: bounds(sel) } } : { k: 'resize', hx, hy, start: sel[0] };
    box.setPointerCapture?.(ev.pointerId);
  };
  const startRotate = (ev: RPE<HTMLElement>) => {
    ev.stopPropagation();
    const e = sel[0];
    drag.current = { k: 'rotate', start: e, cx: e.x + e.w / 2, cy: e.y + e.h / 2 };
    (ev.currentTarget.closest('.dz-over') as HTMLDivElement).setPointerCapture?.(ev.pointerId);
  };
  const startAnchor = (ev: RPE<HTMLElement>, e: El) => {
    ev.stopPropagation();
    drag.current = { k: 'anchor', start: e };
    (ev.currentTarget.closest('.dz-over') as HTMLDivElement).setPointerCapture?.(ev.pointerId);
  };
  const startCrop = (ev: RPE<HTMLElement>, mode: 'pan' | 'size', hx = 0, hy = 0) => {
    ev.stopPropagation();
    const e = here.find((x) => x.id === cropOf);
    if (!e) return;
    const p = toPage(ev);
    drag.current = { k: 'crop', mode, hx, hy, start: e, x0: p.x, y0: p.y };
    (ev.currentTarget.closest('.dz-over') as HTMLDivElement).setPointerCapture?.(ev.pointerId);
  };

  const onDouble = (ev: React.MouseEvent) => {
    if (!canEdit) return;
    const p = toPage(ev);
    const t = topAt(p.x, p.y);
    if (!t || t.locked) return;
    if (t.t === 'text' || t.t === 'label' || (t.t === 'shape' && !isLine(t.shape)) || t.t === 'wordbank' || t.t === 'qr') setEditing(t.id);
    else if (t.t === 'image' && t.img) setCropOf(t.id);
    else if (t.t === 'image') (frameFor.current = t.id), frameIn.current?.click();
  };

  // Right-click: what you can do with the thing under the pointer, or with the page.
  const onMenu = (ev: React.MouseEvent) => {
    ev.preventDefault();
    if (!canEdit || !page) return;
    const p = toPage(ev);
    const t = topAt(p.x, p.y);
    const paste = { label: 'Paste', icon: 'copyall', hint: 'Ctrl+V', disabled: !clip.current.length, onClick: () => pasteClip() } as MenuItem;
    if (!t) {
      setSelIds([]);
      return openMenu(ev, [
        paste,
        { label: 'Select everything', icon: 'check', hint: 'Ctrl+A', onClick: () => setSelIds(shown.filter((x) => !x.locked).map((x) => x.id)) },
        'sep',
        { label: 'Add text here', icon: 'edit', hint: 'T', onClick: () => void add([{ t: 'text', text: 'Add some text', font: 'Fraunces', size: 28, color: '#262420', lh: 1.4, x: Math.round(p.x), y: Math.round(p.y), w: 360, h: textHeight({ text: 'Add some text', font: 'Fraunces', size: 28, lh: 1.4 }, 360) }], { edit: true }) },
        { label: 'Add a label pointing here', icon: 'tag', onClick: () => void add([{ t: 'label', text: 'word', ax: p.x, ay: p.y, x: p.x < page.w - 220 ? p.x + 70 : p.x - 230, y: p.y - 20, w: 160, h: 40, font: 'Fraunces', size: 18 }], { edit: true }) },
      ]);
    }
    const ids = selIds.includes(t.id) ? selIds : [t.id];
    setSelIds(ids);
    const list = here.filter((e) => ids.includes(e.id));
    const all = (f: (e: El) => Partial<El>) => patch(Object.fromEntries(list.map((e) => [e.id, f(e)])));
    const one = list.length === 1 ? list[0] : null;
    openMenu(ev, [
      ...(one && (one.t === 'text' || one.t === 'label' || (one.t === 'shape' && !isLine(one.shape))) ? [{ label: 'Type', icon: 'pen', hint: 'Enter', onClick: () => setEditing(one.id) } as MenuItem] : []),
      ...(one?.t === 'image' && one.img ? [{ label: 'Crop', icon: 'edit', onClick: () => setCropOf(one.id) } as MenuItem] : []),
      ...(one?.t === 'image' ? [{ label: one.img ? 'Change the picture…' : 'Add a picture…', icon: 'picture', onClick: () => ((frameFor.current = one.id), frameIn.current?.click()) } as MenuItem] : []),
      { label: 'Copy', icon: 'copyall', hint: 'Ctrl+C', onClick: () => copy(list) },
      paste,
      { label: 'Duplicate', icon: 'copyall', hint: 'Ctrl+D', onClick: duplicate },
      'sep',
      { label: 'Bring to front', icon: 'next', hint: 'Ctrl+]', onClick: () => zIndex('top') },
      { label: 'Bring forward', icon: 'next', hint: ']', onClick: () => zIndex('up') },
      { label: 'Send backward', icon: 'prev', hint: '[', onClick: () => zIndex('down') },
      { label: 'Send to back', icon: 'prev', hint: 'Ctrl+[', onClick: () => zIndex('bottom') },
      'sep',
      { label: list.every((e) => e.locked) ? 'Unlock' : 'Lock in place', icon: list.every((e) => e.locked) ? 'unlock' : 'lock', onClick: () => all((e) => ({ locked: !list.every((x) => x.locked) || undefined, ...(e.locked ? {} : {}) })) },
      { label: 'Hide', icon: '', onClick: () => all(() => ({ hidden: true })) },
      { label: 'Only learner A sees it', icon: list.every((e) => e.ver === 'A') ? 'check' : '', onClick: () => all(() => ({ ver: 'A' })) },
      { label: 'Only learner B sees it', icon: list.every((e) => e.ver === 'B') ? 'check' : '', onClick: () => all(() => ({ ver: 'B' })) },
      ...(list.some((e) => e.ver) ? [{ label: 'Both learners see it', icon: '', onClick: () => all(() => ({ ver: undefined })) } as MenuItem] : []),
      'sep',
      { label: 'Delete', icon: 'trash', hint: 'Delete', danger: true, onClick: () => remove(list.filter((e) => !e.locked).map((e) => e.id)) },
    ]);
  };

  // Zooming with Ctrl and the wheel, around the pointer.
  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const f = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => Math.max(0.08, Math.min(5, z * Math.exp(-e.deltaY * 0.0022))));
    };
    s.addEventListener('wheel', f, { passive: false });
    return () => s.removeEventListener('wheel', f);
  }, []);

  // ------------------------------------------------------------------ keys

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input:not([type=range]):not([type=checkbox]), textarea, select, [contenteditable="true"], [role=menu], .scrim')) {
      if (e.key === 'Escape' && editing) setEditing('');
      return;
    }
    if (t.closest('button, [role=button], input') && (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow'))) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === ' ') {
      space.current = true;
      return;
    }
    if (!canEdit) return;
    if (mod && e.key.toLowerCase() === 'z') return e.preventDefault(), e.shiftKey ? edits.redo() : edits.undo();
    if (mod && e.key.toLowerCase() === 'y') return e.preventDefault(), edits.redo();
    if (mod && e.key.toLowerCase() === 'a') return e.preventDefault(), setSelIds(shown.filter((x) => !x.locked).map((x) => x.id));
    if (mod && e.key.toLowerCase() === 'd') return e.preventDefault(), duplicate();
    if (mod && e.key.toLowerCase() === 'c' && sel.length) return void copy(sel);
    if (mod && e.key.toLowerCase() === 'x' && sel.length) return void (copy(sel), remove(sel.filter((x) => !x.locked).map((x) => x.id)));
    if (mod && e.key === '0') return e.preventDefault(), fit();
    if (mod && (e.key === '=' || e.key === '+')) return e.preventDefault(), setZoom((z) => Math.min(5, z * 1.25));
    if (mod && e.key === '-') return e.preventDefault(), setZoom((z) => Math.max(0.08, z / 1.25));
    if (e.key === 'Escape') return setSelIds([]), setTool('select'), setCropOf('');
    if (cropOf && e.key === 'Enter') return setCropOf('');
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) return e.preventDefault(), remove(sel.filter((x) => !x.locked).map((x) => x.id));
    if (e.key === 'Enter' && sel.length === 1 && sel[0].t !== 'image') return e.preventDefault(), setEditing(sel[0].id);
    if (e.key === ']') return zIndex(mod ? 'top' : 'up');
    if (e.key === '[') return zIndex(mod ? 'bottom' : 'down');
    if (e.key.startsWith('Arrow') && sel.length) {
      e.preventDefault();
      const n = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0;
      const dy = e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0;
      const ps: Record<string, Partial<El>> = {};
      for (const x of sel) if (!x.locked) ps[x.id] = { x: x.x + dx, y: x.y + dy, ...(x.t === 'label' ? { ax: (x.ax ?? 0) + dx, ay: (x.ay ?? 0) + dy } : {}) };
      return setLive(ps, 500, 'nudge');
    }
    if (!mod && !e.altKey) {
      const k = e.key.toLowerCase();
      const map: Record<string, Tool> = { v: 'select', h: 'hand', p: 'pen', m: 'marker', l: 'label', e: 'eraser' };
      if (map[k]) return setTool(map[k]);
      if (k === 't' && page) return void add([{ t: 'text', text: 'Add some text', font: 'Fraunces', size: 28, color: '#262420', lh: 1.4, x: Math.round(page.w / 2 - 180), y: Math.round(page.h / 2 - 20), w: 360, h: textHeight({ text: 'Add some text', font: 'Fraunces', size: 28, lh: 1.4 }, 360) }], { edit: true });
    }
  };
  useEffect(() => {
    const dn = (e: KeyboardEvent) => keys.current(e);
    const upk = (e: KeyboardEvent) => e.key === ' ' && (space.current = false);
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', upk);
    return () => (window.removeEventListener('keydown', dn), window.removeEventListener('keyup', upk));
  }, []);
  // Pasting: things copied here, or a picture from anywhere.
  useEffect(() => {
    const f = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable="true"]') || !canEdit) return;
      const pic = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (pic) return e.preventDefault(), void addPicture(pic);
      const txt = e.clipboardData?.getData('text/plain') ?? '';
      if (clip.current.length && (!txt || txt === MARK)) return pasteClip();
      if (txt.trim() && txt !== MARK) add([{ t: 'text', text: txt.trim(), font: 'Fraunces', size: 22, lh: 1.4, color: '#262420', x: 100, y: 100, w: 500, h: textHeight({ text: txt.trim(), font: 'Fraunces', size: 22, lh: 1.4 }, 500) }]);
    };
    document.addEventListener('paste', f);
    return () => document.removeEventListener('paste', f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [add, addPicture, canEdit]);

  // ------------------------------------------------------------------ pages

  const pageMenu = (p: DPage, i: number): MenuItem[] => [
    { label: 'Duplicate the page', icon: 'copyall', onClick: () => void dupPage(p) },
    { label: 'Make a spot-the-difference copy', icon: 'storyboard', hint: 'the same page, to change', onClick: () => void dupPage(p, 'Picture B') },
    { label: 'Move up', icon: 'prev', disabled: i === 0, onClick: () => void movePage(p, -1) },
    { label: 'Move down', icon: 'next', disabled: i === (pages?.length ?? 1) - 1, onClick: () => void movePage(p, 1) },
    'sep',
    { label: 'Delete the page', icon: 'trash', danger: true, disabled: (pages?.length ?? 0) < 2, onClick: () => void delPage(p) },
  ];
  const dupPage = async (p: DPage, name?: string) => {
    const pid = newId() + newId();
    const b = writeBatch(db);
    b.set(doc(pagesCol(d.id), pid), clean({ w: p.w, h: p.h, bg: p.bg, name: name ?? p.name, order: p.order + 0.5 }));
    for (const e of els.filter((x) => x.page === p.id)) b.set(doc(elsCol(d.id), newId() + newId()), clean({ ...e, id: undefined, page: pid }));
    await b.commit();
    const all = [...(pages ?? []), { id: pid, order: p.order + 0.5 } as DPage].sort((a, x) => a.order - x.order);
    const b2 = writeBatch(db);
    all.forEach((x, k) => b2.update(doc(pagesCol(d.id), x.id), { order: k }));
    await b2.commit().catch(() => {});
    setPageId(pid);
  };
  const movePage = async (p: DPage, dir: number) => {
    const list = [...(pages ?? [])];
    const i = list.findIndex((x) => x.id === p.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const b = writeBatch(db);
    list.forEach((x, k) => b.update(doc(pagesCol(d.id), x.id), { order: k }));
    await b.commit();
  };
  const delPage = async (p: DPage) => {
    if (!(await ask('Delete this page? Everything on it goes too. You can’t undo this.', { ok: 'Delete the page' }))) return;
    const b = writeBatch(db);
    els.filter((x) => x.page === p.id).forEach((x) => b.delete(doc(elsCol(d.id), x.id)));
    b.delete(doc(pagesCol(d.id), p.id));
    await b.commit();
    setPageId('');
  };
  const newPage = async () => {
    if (!page) return;
    const pid = newId() + newId();
    await setDoc(doc(pagesCol(d.id), pid), { w: page.w, h: page.h, bg: '#ffffff', order: (pages?.length ?? 0) + 1 });
    setPageId(pid);
  };

  // ------------------------------------------------------------------ text being typed

  const ed = here.find((e) => e.id === editing);
  const typed = (v: string) => {
    if (!ed) return;
    const p: Partial<El> = { text: v };
    if (ed.t === 'text') p.h = textHeight({ ...ed, text: v }, ed.w);
    setLive({ [ed.id]: p }, 700, 'text');
  };
  useEffect(() => {
    if (!editing) flush('text');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const cx: Ctx | null = page
    ? {
        d,
        canEdit,
        page,
        pages: pages ?? [],
        els,
        here,
        sel,
        select: setSelIds,
        accent,
        setAccent: (c) => void saveMeta(d.id, { accent: c }),
        add,
        patch,
        setLive,
        remove,
        tool,
        setTool,
        pen,
        setPen,
        addPicture,
        imgs,
        setPage: setPageP,
        addPages,
        editText: setEditing,
        view,
        zIndex,
        align,
        duplicate,
        goPage: setPageId,
        spot,
        learnerUser: isLearnerEmail(auth.currentUser?.email),
      }
    : null;

  if (pages === null) return <div className="dz-msg">One moment…</div>;
  if (!pages.length || !page || !cx)
    return canEdit ? <StartScreen onPick={(t) => void addPages(t, true)} /> : <div className="dz-msg">This design is empty.</div>;

  const z = zoom;
  const one = sel.length === 1 ? sel[0] : null;
  const box = sel.length ? (one ? null : bounds(sel)) : null;
  const cropEl = cropOf ? here.find((e) => e.id === cropOf) : undefined;
  const cropIm = cropEl ? (imgs.get(cropEl.img ?? '') as HTMLImageElement | undefined) : undefined;
  const cursor = tool === 'hand' ? 'grab' : tool === 'pen' || tool === 'marker' || tool === 'highlighter' ? 'crosshair' : tool === 'eraser' ? 'cell' : tool === 'label' ? 'copy' : tool === 'magic' ? 'crosshair' : 'default';

  return (
    <div className="dz" data-tool={tool}>
      <div className="dz-top">
        <div className="dz-group">
          <button type="button" className="dz-ib" onClick={edits.undo} disabled={!edits.canUndo} data-tip="Undo (Ctrl+Z)" aria-label="Undo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
          </button>
          <button type="button" className="dz-ib" onClick={edits.redo} disabled={!edits.canRedo} data-tip="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
          </button>
        </div>
        <div className="dz-group dz-zoom">
          <button type="button" className="dz-ib" onClick={() => setZoom((v) => Math.max(0.08, v / 1.25))} aria-label="Zoom out">−</button>
          <button type="button" className="dz-zv" onClick={(e) => openMenu(e, [{ label: 'Fit the page', hint: 'Ctrl+0', onClick: fit }, ...[0.5, 1, 1.5, 2].map((v) => ({ label: `${v * 100}%`, onClick: () => setZoom(v) }))])} data-tip="Zoom" aria-label={`Zoom: ${Math.round(z * 100)}%`}>{Math.round(z * 100)}%</button>
          <button type="button" className="dz-ib" onClick={() => setZoom((v) => Math.min(5, v * 1.25))} aria-label="Zoom in">+</button>
        </div>
        <div className="dz-seg" role="radiogroup" aria-label="Whose copy">
          {(['all', 'A', 'B'] as View[]).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)} data-tip={v === 'all' ? 'Everything' : `What learner ${v} sees`}>
              {v === 'all' ? 'Everything' : `Learner ${v}`}
            </button>
          ))}
        </div>
        <label className="dz-check" data-tip="Label words become lines to write on">
          <input type="checkbox" checked={learner} onChange={(e) => setLearner(e.target.checked)} /> Learners’ copy
        </label>
        <span className="dz-grow" />
        {canEdit ? <span className={'dz-saved' + (edits.failed ? ' bad' : '')} role="status">{edits.failed ? 'Not saved. Check your connection.' : edits.saving ? 'Saving…' : 'Saved'}</span> : <span className="dz-saved">You can look at this design and download it</span>}
        <DownloadMenu cx={cx} />
      </div>
      <div className="dz-body">
        {canEdit && <nav className="dz-rail" aria-label="Tools">
          {(
            [
              ['templates', 'Templates', <path key="t" d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />],
              ['elements', 'Elements', <path key="e" d="M7 3.5 11 10H3zM17 7a3.5 3.5 0 1 1 0 .01M4 14h7v7H4zM17 14l3.5 3.5L17 21l-3.5-3.5z" />],
              ['text', 'Text', <path key="x" d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6" />],
              ['pictures', 'Pictures', <path key="p" d="M4 5.5h16v13H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9.5h.01" />],
              ['people', 'People', <path key="pp" d="M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 22v-6a6 6 0 0 1 12 0v6M9 22v-5M15 22v-5" />],
              ['teach', 'Teaching', <path key="tc" d="M3 9l9-5 9 5-9 5zM7 11.2V16c0 1.5 2.5 3 5 3s5-1.5 5-3v-4.8M21 9v6" />],
              ['draw', 'Draw', <path key="d" d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16zM14 7l3 3" />],
              ['layers', 'Layers', <path key="l" d="M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />],
            ] as [DrawerKey, string, JSX.Element][]
          ).map(([k, label, icon]) => (
            <button key={k} type="button" className={'dz-railb' + (drawer === k ? ' on' : '')} onClick={() => (setPropsOpen(false), setDrawer(drawer === k ? null : k), k === 'draw' ? setTool('pen') : tool !== 'select' && k !== 'teach' && setTool('select'))} aria-pressed={drawer === k}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {icon}
              </svg>
              <span>{label}</span>
            </button>
          ))}
        </nav>}
        {drawer && canEdit && (
          <aside className="dz-drawer" aria-label="Add to the page">
            <Drawer k={drawer} cx={cx} onClose={() => setDrawer(null)} />
            {phone && <button type="button" className="dz-sheet-scrim" aria-label="Close" onClick={() => setDrawer(null)} />}
          </aside>
        )}
        <main
          className="dz-stage"
          onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
          onDrop={(e) => {
            const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
            if (!files.length || !canEdit || !canvas.current) return;
            e.preventDefault();
            const p = toPage(e);
            const frame = [...shown].reverse().find((x) => x.t === 'image' && hit(x, p.x, p.y));
            void (async () => {
              for (const [i, f] of files.entries()) await addPicture(f, { into: i === 0 && frame && !frame.img ? frame.id : i === 0 && frame ? frame.id : undefined, name: f.name.replace(/\.[a-z0-9]+$/i, '') });
            })();
          }}
        >
          <div className="dz-scroll" ref={scroller}>
            <div className="dz-board" style={{ width: page.w * z + PAD * 2, height: page.h * z + PAD * 2 }}>
              <div className="dz-paper" style={{ left: PAD, top: PAD, width: page.w * z, height: page.h * z }}>
                <canvas ref={canvas} style={{ width: page.w * z, height: page.h * z }} aria-label={`Page ${pages.indexOf(page) + 1}`} role="img" />
                <div className="dz-over" style={{ cursor }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setHover('')} onContextMenu={onMenu} onDoubleClick={onDouble}>
                  {/* Guides while moving. */}
                  {guides.x.map((g) => (
                    <span key={'gx' + g} className="dz-guide v" style={{ left: g * z }} />
                  ))}
                  {guides.y.map((g) => (
                    <span key={'gy' + g} className="dz-guide h" style={{ top: g * z }} />
                  ))}
                  {hover && !selIds.includes(hover) && !drag.current && (() => {
                    const h = here.find((e) => e.id === hover);
                    return h ? <span className="dz-hover" style={{ left: h.x * z, top: h.y * z, width: h.w * z, height: h.h * z, transform: `rotate(${h.t === 'label' ? 0 : h.rot ?? 0}deg)` }} /> : null;
                  })()}
                  {canEdit && !here.length && (
                    <div className="dz-empty">
                      <strong>This page is empty</strong>
                      <span>{phone ? 'Add text, pictures and shapes from the bar below.' : 'Add text, pictures and shapes from the left, or drop a picture here.'}</span>
                    </div>
                  )}
                  {marquee && <span className="dz-marquee" style={{ left: marquee.x * z, top: marquee.y * z, width: marquee.w * z, height: marquee.h * z }} />}
                  {/* Outlines of everything selected. */}
                  {sel.length > 1 &&
                    sel.map((e) => {
                      const c = corners(e);
                      return <svg key={e.id} className="dz-outline" style={{ left: 0, top: 0 }} width={page.w * z} height={page.h * z}><polygon points={c.map(([x, y]) => `${x * z},${y * z}`).join(' ')} /></svg>;
                    })}
                  {box && (
                    <div className="dz-sel" style={{ left: box.x * z, top: box.y * z, width: box.w * z, height: box.h * z }}>
                      {canEdit && HANDLES.map(([hx, hy]) => (hx && hy ? <span key={hx + ',' + hy} className="dz-h" style={{ left: `${((hx + 1) / 2) * 100}%`, top: `${((hy + 1) / 2) * 100}%` }} onPointerDown={(ev) => startHandle(ev, hx, hy)} /> : null))}
                    </div>
                  )}
                  {one && !cropOf && <SelBox e={one} z={z} canEdit={canEdit && !one.locked} onHandle={startHandle} onRotate={startRotate} onAnchor={startAnchor} />}
                  {cropEl && cropIm && (
                    <CropBox e={cropEl} im={cropIm} z={z} onStart={startCrop} onDone={() => (setCropOf(''), flush())} />
                  )}
                  {ed && <TextEdit e={ed} z={z} onChange={typed} onDone={() => setEditing('')} accent={accent} />}
                </div>
              </div>
            </div>
          </div>
          {one && !editing && !cropOf && canEdit && (
            <div className="dz-float" role="toolbar" aria-label="Quick changes">
              {one.t === 'image' && one.img && (
                <button type="button" onClick={() => setCropOf(one.id)} data-tip="Crop (double-click)">
                  <UiIcon name="edit" size={15} /> Crop
                </button>
              )}
              {(one.t === 'text' || one.t === 'shape' || one.t === 'label') && (
                <button type="button" onClick={() => setEditing(one.id)} data-tip="Type (Enter)">
                  <UiIcon name="pen" size={15} /> Type
                </button>
              )}
              {(one.t === 'text' || (one.t === 'shape' && one.text) || one.t === 'label') && (
                <span className="dz-fsize">
                  <button type="button" aria-label="Smaller text" data-tip="Smaller text" onClick={() => { const size = Math.max(6, Math.round((one.size ?? 22) / 1.12)); patch({ [one.id]: { size, ...(one.t === 'text' ? { h: textHeight({ ...one, size }, one.w) } : {}) } }, 'fsize'); }}>A−</button>
                  <em>{Math.round(one.size ?? 22)}</em>
                  <button type="button" aria-label="Bigger text" data-tip="Bigger text" onClick={() => { const size = Math.round((one.size ?? 22) * 1.12); patch({ [one.id]: { size, ...(one.t === 'text' ? { h: textHeight({ ...one, size }, one.w) } : {}) } }, 'fsize'); }}>A+</button>
                  <button type="button" className={one.bold ? 'on' : ''} aria-label="Bold" aria-pressed={!!one.bold} onClick={() => patch({ [one.id]: { bold: !one.bold, ...(one.t === 'text' ? { h: textHeight({ ...one, bold: !one.bold }, one.w) } : {}) } })}><b>B</b></button>
                </span>
              )}
              {phone && (
                <button type="button" onClick={() => (setDrawer(null), setPropsOpen(true))} aria-label="Settings">
                  <UiIcon name="settings" size={15} />
                </button>
              )}
              <button type="button" onClick={duplicate} data-tip="Duplicate (Ctrl+D)" aria-label="Duplicate">
                <UiIcon name="copyall" size={15} />
              </button>
              <button type="button" onClick={() => patch({ [one.id]: { locked: !one.locked } })} data-tip={one.locked ? 'Unlock' : 'Lock in place'} aria-label={one.locked ? 'Unlock' : 'Lock'}>
                <UiIcon name={one.locked ? 'unlock' : 'lock'} size={15} />
              </button>
              <button type="button" onClick={(e) => openMenu(e, [{ label: 'Bring forward', icon: 'next', hint: ']', onClick: () => zIndex('up') }, { label: 'Bring to front', icon: 'next', hint: 'Ctrl+]', onClick: () => zIndex('top') }, { label: 'Send backward', icon: 'prev', hint: '[', onClick: () => zIndex('down') }, { label: 'Send to back', icon: 'prev', hint: 'Ctrl+[', onClick: () => zIndex('bottom') }])} data-tip="Order" aria-label="Order">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3 3 8l9 5 9-5zM3 13l9 5 9-5" /></svg>
              </button>
              <button type="button" className="danger" onClick={() => remove([one.id])} data-tip="Delete (Delete)" aria-label="Delete">
                <UiIcon name="trash" size={15} />
              </button>
            </div>
          )}
          {cropOf && (
            <div className="dz-float">
              <span className="dz-float-t">Drag the picture to move it. Drag the corners to crop.</span>
              <button type="button" className="primary" onClick={() => (setCropOf(''), flush())}>
                Done
              </button>
            </div>
          )}
          {tool !== 'select' && tool !== 'hand' && (
            <div className="dz-toolnote" role="status">
              {tool === 'label' ? 'Click on the picture where the label should point.' : tool === 'magic' ? 'Click the colour to take away. Hold Shift to take it away everywhere in the picture.' : tool === 'eraser' ? 'Click or drag over drawings to rub them out.' : 'Draw on the page. Hold the pen down and move.'}
              <button type="button" onClick={() => setTool('select')}>Done</button>
            </div>
          )}
          <Pages cx={cx} onMenu={pageMenu} onNew={() => void newPage()} />
          <input ref={frameIn} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && void addPicture(e.target.files[0], { into: frameFor.current, name: e.target.files[0].name.replace(/\.[a-z0-9]+$/i, '') }), (e.target.value = ''))} />
        </main>
        {canEdit && (!phone || propsOpen) && (
          <aside className={'dz-props' + (phone ? ' sheet' : '')} aria-label="Settings">
            {phone && (
              <div className="dz-sheet-head">
                <strong>Settings</strong>
                <button type="button" className="dz-ib" onClick={() => setPropsOpen(false)} aria-label="Close">×</button>
              </div>
            )}
            <Props cx={cx} />
          </aside>
        )}
      </div>
    </div>
  );
}

// The box round one thing: handles to size it, and one to turn it.
function SelBox({ e, z, canEdit, onHandle, onRotate, onAnchor }: { e: El; z: number; canEdit: boolean; onHandle: (ev: RPE<HTMLElement>, hx: number, hy: number) => void; onRotate: (ev: RPE<HTMLElement>) => void; onAnchor: (ev: RPE<HTMLElement>, e: El) => void }) {
  const rot = e.t === 'label' ? 0 : e.rot ?? 0;
  const line = e.t === 'shape' && isLine(e.shape);
  const text = e.t === 'text';
  const hs = HANDLES.filter(([hx, hy]) => (line ? hy === 0 : text ? hy === 0 || hx !== 0 : true));
  const end = e.t === 'label' ? labelEnd(e) : null;
  return (
    <>
      <div className={'dz-sel one' + (e.locked ? ' locked' : '')} style={{ left: e.x * z, top: e.y * z, width: e.w * z, height: e.h * z, transform: `rotate(${rot}deg)` }}>
        {canEdit &&
          hs.map(([hx, hy]) => (
            <span key={hx + ',' + hy} className={'dz-h' + (hx && hy ? '' : hx ? ' side-v' : ' side-h')} style={{ left: `${((hx + 1) / 2) * 100}%`, top: `${((hy + 1) / 2) * 100}%` }} onPointerDown={(ev) => onHandle(ev, hx, hy)} />
          ))}
        {canEdit && e.t !== 'label' && (
          <span className="dz-rot" onPointerDown={onRotate} aria-label="Turn" data-tip="Drag to turn. Shift: steps of 15°">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" /></svg>
          </span>
        )}
        {e.locked && <span className="dz-lockb"><UiIcon name="lock" size={11} /></span>}
      </div>
      {end && canEdit && <span className="dz-anchor" style={{ left: end.ax * z, top: end.ay * z }} onPointerDown={(ev) => onAnchor(ev, e)} data-tip="Drag to the thing the label names" />}
    </>
  );
}

function CropBox({ e, im, z, onStart, onDone }: { e: El; im: HTMLImageElement; z: number; onStart: (ev: RPE<HTMLElement>, mode: 'pan' | 'size', hx?: number, hy?: number) => void; onDone: () => void }) {
  const c = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const k = e.w / (c.w * im.naturalWidth);
  const full = { x: e.x - c.x * im.naturalWidth * k, y: e.y - c.y * im.naturalHeight * k, w: im.naturalWidth * k, h: im.naturalHeight * k };
  return (
    <>
      <img className="dz-cropghost" src={im.src} alt="" style={{ left: full.x * z, top: full.y * z, width: full.w * z, height: full.h * z }} draggable={false} onPointerDown={(ev) => onStart(ev, 'pan')} />
      <div className="dz-cropbox" style={{ left: e.x * z, top: e.y * z, width: e.w * z, height: e.h * z }} onPointerDown={(ev) => onStart(ev, 'pan')} onDoubleClick={onDone}>
        <img src={im.src} alt="" draggable={false} style={{ left: (full.x - e.x) * z, top: (full.y - e.y) * z, width: full.w * z, height: full.h * z }} />
        {HANDLES.map(([hx, hy]) => (
          <span key={hx + ',' + hy} className={'dz-ch' + (hx && hy ? '' : hx ? ' side-v' : ' side-h')} style={{ left: `${((hx + 1) / 2) * 100}%`, top: `${((hy + 1) / 2) * 100}%` }} onPointerDown={(ev) => onStart(ev, 'size', hx, hy)} />
        ))}
      </div>
    </>
  );
}

// Typing straight onto the page, in the thing's own font and size.
function TextEdit({ e, z, onChange, onDone, accent }: { e: El; z: number; onChange: (v: string) => void; onDone: () => void; accent: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.select();
  }, [e.id]);
  let b = { x: 0, y: 0, w: e.w, h: e.h };
  if (e.t === 'shape') b = textBox(e);
  const chip = Math.min(e.h - 10, 24);
  if (e.t === 'label') b = (e.pin ?? 'number') === 'number' ? { x: chip + 12, y: 0, w: e.w - chip - 20, h: e.h } : { x: 10, y: 0, w: e.w - 20, h: e.h };
  const multi = e.t === 'wordbank';
  const size = (e.t === 'wordbank' ? 16 : e.size ?? 22) * z;
  const v = e.t === 'qr' ? e.url ?? '' : e.text ?? '';
  return (
    <div className="dz-typing" style={{ left: e.x * z, top: e.y * z, width: e.w * z, height: e.h * z, transform: `rotate(${e.t === 'label' ? 0 : e.rot ?? 0}deg)` }}>
      <textarea
        ref={ref}
        value={v}
        aria-label={e.t === 'qr' ? 'The link' : e.t === 'wordbank' ? 'More words, with commas between them' : 'Text'}
        placeholder={e.t === 'qr' ? 'Paste a link' : e.t === 'wordbank' ? 'Extra words, with commas' : ''}
        onChange={(ev) => onChange(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) ev.preventDefault(), onDone();
          if (ev.key === 'Enter' && e.t === 'label') ev.preventDefault(), onDone();
        }}
        onBlur={onDone}
        spellCheck
        style={{
          left: b.x * z,
          top: b.y * z,
          width: b.w * z,
          height: e.t === 'text' ? '100%' : b.h * z,
          font: multi || e.t === 'qr' ? `600 ${14 * Math.max(1, z)}px Karla` : `${e.italic ? 'italic ' : ''}${e.bold ? 700 : 400} ${size}px "${e.font ?? 'Fraunces'}"`,
          lineHeight: e.lh ?? 1.4,
          letterSpacing: `${(e.ls ?? 0) * ((e.size ?? 22) / 22) * z}px`,
          textAlign: e.align ?? 'left',
          color: multi || e.t === 'qr' ? '#262420' : e.color ?? '#262420',
          textTransform: e.upper ? 'uppercase' : 'none',
          caretColor: accent,
          background: multi || e.t === 'qr' ? '#fff' : 'transparent',
          paddingTop: e.t === 'label' || (e.t === 'shape' && e.valign === 'middle') ? Math.max(0, (b.h * z - size * (e.lh ?? 1.4) * Math.max(1, v.split('\n').length)) / 2) : 0,
        }}
      />
    </div>
  );
}

function Pages({ cx, onMenu, onNew }: { cx: Ctx; onMenu: (p: DPage, i: number) => MenuItem[]; onNew: () => void }) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    const t = setTimeout(() => {
      const out: Record<string, string> = {};
      for (const p of cx.pages) {
        const s = 92 / Math.max(p.w, p.h);
        const c = document.createElement('canvas');
        c.width = Math.round(p.w * s * 2);
        c.height = Math.round(p.h * s * 2);
        drawPage(c.getContext('2d')!, p, cx.els, { imgs: cx.imgs, view: cx.view, accent: cx.accent }, s * 2);
        out[p.id] = c.toDataURL('image/jpeg', 0.8);
      }
      setThumbs(out);
    }, 400);
    return () => clearTimeout(t);
  }, [cx.pages, cx.els, cx.imgs, cx.view, cx.accent]);
  return (
    <div className="dz-pages" aria-label="Pages">
      {cx.pages.map((p, i) => (
        <button
          key={p.id}
          type="button"
          className={'dz-pg' + (p.id === cx.page.id ? ' on' : '')}
          onClick={() => (cx.goPage(p.id), cx.select([]))}
          onContextMenu={(e) => (e.preventDefault(), cx.canEdit && openMenu(e, onMenu(p, i)))}
          aria-label={`Page ${i + 1}${p.name ? ', ' + p.name : ''}`}
          aria-current={p.id === cx.page.id}
        >
          {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" style={{ aspectRatio: `${p.w} / ${p.h}` }} /> : <span className="dz-pg-blank" style={{ aspectRatio: `${p.w} / ${p.h}` }} />}
          <span className="dz-pg-n">{p.name || i + 1}</span>
          {cx.canEdit && p.id === cx.page.id && (
            <span className="dz-pg-more" role="button" tabIndex={0} aria-label="Page options" onClick={(e) => (e.stopPropagation(), openMenu(e, onMenu(p, i)))}>
              ⋯
            </span>
          )}
        </button>
      ))}
      {cx.canEdit && (
        <button type="button" className="dz-pg add" onClick={onNew} aria-label="Add a page">
          <span>+</span>
        </button>
      )}
    </div>
  );
}


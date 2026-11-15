import { NSelect } from '../components/Select';
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent, type Ref } from 'react';
import { loadPicture, storePicture, type El } from './model';
import type { Ctx } from './Editor';
import { blankMap, cloneFigure, makeMapItem, MAP_PRESETS, mapPointFromCanvas } from './figureTemplates';
import { drawFigure, MAP_ICONS, type MapFigure, type MapItem, type MapItemKind, type Point } from './figures';
import MapSymbolLibrary from './MapSymbolLibrary';
import { MapToolIcon } from './MapToolIcons';
import { MapHistoryToolbar, MapLayersPanel, MapMarkerKey } from './MapLayersPanel';

type MapTool = 'select' | MapItemKind;
type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'rotate';
type Dragging = { id: string; item: MapItem; start: Point; mode: 'move' | 'vertex' | 'resize' | 'rotate'; vertex?: number; handle?: Handle; groupItems?: MapItem[]; recorded?: boolean };

const pathKinds: MapItemKind[] = ['road', 'river', 'footpath', 'wall', 'fence', 'bridge'];
const placeKinds: MapItemKind[] = ['building', 'room', 'zone', 'water', 'roundabout', 'tree', 'gate'];
const resizableKinds: MapItemKind[] = ['building', 'room', 'zone', 'water', 'roundabout', 'icon'];
const labelOf = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1).replace(/([A-Z])/g, ' $1');
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const copyMap = (figure: MapFigure) => cloneFigure(figure) as MapFigure;
const isPath = (kind: MapTool) => pathKinds.includes(kind as MapItemKind);
const near = (a: Point, b: Point, distance = .03) => Math.hypot(a.x - b.x, a.y - b.y) <= distance;
const pathCentre = (points: Point[]): Point => ({ x: (Math.min(...points.map(point => point.x)) + Math.max(...points.map(point => point.x))) / 2, y: (Math.min(...points.map(point => point.y)) + Math.max(...points.map(point => point.y))) / 2 });
const rotateAround = (point: Point, centre: Point, degrees: number): Point => {
  const radians = degrees * Math.PI / 180;
  const dx = (point.x - centre.x) * 920, dy = (point.y - centre.y) * 570;
  return { x: centre.x + (dx * Math.cos(radians) - dy * Math.sin(radians)) / 920, y: centre.y + (dx * Math.sin(radians) + dy * Math.cos(radians)) / 570 };
};
const snapValue = (value: number) => clamp(Math.round(value / .05) * .05);
const straightPoint = (from: Point, to: Point): Point => {
  const dx = (to.x - from.x) * 920, dy = (to.y - from.y) * 570;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
  const length = Math.hypot(dx, dy);
  return { x: clamp(from.x + Math.cos(angle) * length / 920), y: clamp(from.y + Math.sin(angle) * length / 570) };
};
const distanceToSegment = (point: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
};
const nextLetter = (items: MapItem[]) => {
  const used = new Set(items.filter(item => item.kind === 'marker').map(item => item.label?.toUpperCase()));
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(letter => !used.has(letter)) || 'A';
};

function Field({ name, value, onChange, inputRef }: { name: string; value: string; onChange: (value: string) => void; inputRef?: Ref<HTMLInputElement> }) {
  return <label className="dz-field"><span>{name}</span><input ref={inputRef} value={value} onChange={event => onChange(event.target.value)} /></label>;
}
function NumberField({ name, value, onChange }: { name: string; value?: number; onChange: (value: number | undefined) => void }) {
  return <label className="dz-field"><span>{name}</span><input type="number" value={value ?? ''} onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))} /></label>;
}
function MapLayoutThumbnail({ figure }: { figure: MapFigure }) {
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = preview.current?.getContext('2d');
    if (context) drawFigure(context, figure, 200, 144);
  }, [figure]);
  return <canvas ref={preview} width={200} height={144} aria-hidden="true" />;
}

export default function MapEditor({ cx, e, set, onClose }: { cx: Ctx; e: El; set: (patch: Partial<El>, key?: string) => void; onClose: () => void }) {
  const initial = e.figure as MapFigure;
  const [draft, setDraft] = useState<MapFigure>(() => copyMap(initial));
  const draftRef = useRef(draft);
  const history = useRef<{ past: MapFigure[]; future: MapFigure[] }>({ past: [], future: [] });
  const [, updateHistory] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = selectedIds.at(-1) || '';
  const selectIds = (ids: string[]) => setSelectedIds(ids);
  const changeDraft = (update: MapFigure | ((value: MapFigure) => MapFigure), record = true) => {
    const previous = draftRef.current;
    const next = typeof update === 'function' ? update(previous) : update;
    if (JSON.stringify(next) === JSON.stringify(previous)) return;
    if (record) {
      history.current.past.push(copyMap(previous));
      if (history.current.past.length > 100) history.current.past.shift();
      history.current.future = [];
      updateHistory(value => value + 1);
    }
    draftRef.current = next;
    setDraft(next);
  };
  const checkpoint = () => {
    history.current.past.push(copyMap(draftRef.current));
    if (history.current.past.length > 100) history.current.past.shift();
    history.current.future = [];
    updateHistory(value => value + 1);
  };
  const travel = (direction: 'undo' | 'redo') => {
    const from = direction === 'undo' ? history.current.past : history.current.future;
    const to = direction === 'undo' ? history.current.future : history.current.past;
    const next = from.pop();
    if (!next) return;
    to.push(copyMap(draftRef.current));
    draftRef.current = next;
    setDraft(next);
    setSelectedIds(ids => ids.filter(id => next.items.some(item => item.id === id)));
    setNamingId('');
    updateHistory(value => value + 1);
  };
  const [tool, setTool] = useState<MapTool>('select');
  const [iconKey, setIconKey] = useState('café');
  const [symbolStyle, setSymbolStyle] = useState<'plain' | 'shaded'>('plain');
  const [symbolColor, setSymbolColor] = useState('#73578f');
  const [namingId, setNamingId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [snap, setSnap] = useState(false);
  const [pendingPath, setPendingPath] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [pendingPreset, setPendingPreset] = useState<{ name: string; figure: MapFigure } | null>(null);
  const [previewSize, setPreviewSize] = useState<'class' | 'phone' | 'print'>('class');
  const [fitWidth, setFitWidth] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [background, setBackground] = useState<CanvasImageSource | undefined>(() => initial.backgroundImage ? cx.imgs.get(initial.backgroundImage) : undefined);
  const canvas = useRef<HTMLCanvasElement>(null);
  const center = useRef<HTMLDivElement>(null);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const dragging = useRef<Dragging | null>(null);
  const backgroundDrag = useRef<{ start: Point; x: number; y: number; recorded?: boolean } | null>(null);
  const current = draft.items.find(item => item.id === selected && !item.hidden && !item.locked);
  const naming = draft.items.find(item => item.id === namingId);
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(initial);

  useLayoutEffect(() => {
    const target = center.current;
    const drawing = canvasWrap.current;
    if (!target || !drawing) return;
    const measure = () => {
      const styles = getComputedStyle(target);
      const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const gap = parseFloat(styles.rowGap) || 0;
      const siblings = [...target.children].filter(child => child !== drawing);
      const reserved = siblings.reduce((height, child) => height + child.getBoundingClientRect().height, 0) + gap * siblings.length;
      const availableHeight = target.clientHeight - padY - reserved - (previewSize === 'print' ? 24 : 0) - 8;
      const availableWidth = target.clientWidth - padX;
      const modeWidth = previewSize === 'phone' ? 390 : previewSize === 'print' ? 720 : Infinity;
      setFitWidth(Math.max(160, Math.min(availableWidth, modeWidth, availableHeight * 1000 / 720)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    for (const child of target.children) if (child !== drawing) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [tool, pendingPath.length, previewSize]);

  useEffect(() => {
    if (draft.backgroundImage && !background) void loadPicture(cx.d.id, draft.backgroundImage).then(setBackground, () => {});
  }, [draft.backgroundImage, cx.d.id, background]);
  useEffect(() => {
    if (namingId) {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [namingId]);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 1000, 720);
    drawFigure(context, draft, 1000, 720, background);
    if (showGrid) {
      context.save();
      context.strokeStyle = '#9584aa36';
      context.lineWidth = 1;
      for (let n = 1; n < 20; n++) {
        const x = 40 + n * 46;
        context.beginPath(); context.moveTo(x, 88); context.lineTo(x, 658); context.stroke();
      }
      for (let n = 1; n < 20; n++) {
        const y = 88 + n * 28.5;
        context.beginPath(); context.moveTo(40, y); context.lineTo(960, y); context.stroke();
      }
      context.restore();
    }
    if (current) {
      context.save();
      context.strokeStyle = '#8d68b6';
      context.fillStyle = '#fff';
      context.lineWidth = 3;
      if (current.points?.length) {
        current.points.forEach(point => {
          const x = 40 + point.x * 920, y = 88 + point.y * 570;
          context.fillRect(x - 7, y - 7, 14, 14);
          context.strokeRect(x - 7, y - 7, 14, 14);
        });
        const centre = pathCentre(current.points);
        const x = 40 + centre.x * 920, y = 88 + centre.y * 570;
        context.beginPath(); context.moveTo(x, y); context.lineTo(x, y - 44); context.stroke();
        context.beginPath(); context.arc(x, y - 44, 9, 0, Math.PI * 2); context.fill(); context.stroke();
      } else {
        const x = 40 + (current.x ?? .5) * 920, y = 88 + (current.y ?? .5) * 570;
        context.translate(x, y); context.rotate((current.rotation ?? 0) * Math.PI / 180); context.translate(-x, -y);
        if (resizableKinds.includes(current.kind)) {
          const w = (current.w ?? .1) * 920, h = (current.h ?? .1) * 570;
          context.setLineDash([7, 5]);
          context.strokeRect(x - w / 2, y - h / 2, w, h);
          context.setLineDash([]);
          for (const [hx, hy] of [[x-w/2,y-h/2],[x+w/2,y-h/2],[x-w/2,y+h/2],[x+w/2,y+h/2]]) {
            context.fillRect(hx - 7, hy - 7, 14, 14);
            context.strokeRect(hx - 7, hy - 7, 14, 14);
          }
          context.beginPath(); context.moveTo(x, y - h / 2); context.lineTo(x, y - h / 2 - 30); context.stroke();
          context.beginPath(); context.arc(x, y - h / 2 - 37, 9, 0, Math.PI * 2); context.fill(); context.stroke();
        } else {
          context.setLineDash([6, 5]); context.strokeRect(x - 22, y - 22, 44, 44); context.setLineDash([]);
          context.beginPath(); context.moveTo(x, y - 22); context.lineTo(x, y - 59); context.stroke();
          context.beginPath(); context.arc(x, y - 59, 9, 0, Math.PI * 2); context.fill(); context.stroke();
        }
      }
      context.restore();
    }
    if (pendingPath.length) {
      const points = hoverPoint ? [...pendingPath, hoverPoint] : pendingPath;
      context.save();
      context.strokeStyle = '#8d68b6'; context.fillStyle = '#fff'; context.lineWidth = 3;
      context.setLineDash([9, 6]); context.beginPath();
      points.forEach((point, index) => {
        const x = 40 + point.x * 920, y = 88 + point.y * 570;
        if (index) context.lineTo(x, y); else context.moveTo(x, y);
      });
      context.stroke(); context.setLineDash([]);
      pendingPath.forEach(point => {
        const x = 40 + point.x * 920, y = 88 + point.y * 570;
        context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.fill(); context.stroke();
      });
      context.restore();
    }
  }, [draft, current, background, showGrid, pendingPath, hoverPoint]);

  const pointFromClient = (clientX: number, clientY: number) => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return { x: .5, y: .5 };
    const x = (clientX - rect.left) * 1000 / rect.width;
    const y = (clientY - rect.top) * 720 / rect.height;
    const point = mapPointFromCanvas(x, y, 1000, 720);
    return snap ? { x: snapValue(point.x), y: snapValue(point.y) } : point;
  };
  const point = (event: PointerEvent<HTMLCanvasElement>) => pointFromClient(event.clientX, event.clientY);
  const modify = (patch: Partial<MapItem>, id = selected, record = true) => changeDraft(value => ({
    ...value, items: value.items.map(item => item.id === id ? { ...item, ...patch } : item),
  }), record);
  const place = (kind: MapItemKind, at: Point, symbol = iconKey) => {
    const item = makeMapItem(kind, at.x, at.y, symbol);
    if (kind === 'icon') {
      item.label = MAP_ICONS.find(([key]) => key === symbol)?.[1] || 'Place';
      item.iconStyle = symbolStyle;
      item.iconColor = symbolColor;
    }
    if (kind === 'marker') item.label = nextLetter(draft.items);
    changeDraft(value => ({ ...value, items: [...value.items, item] }));
    selectIds([item.id]);
    setNamingId(item.id);
    setTool('select');
    setError('');
  };
  const handleAt = (at: Point, item: MapItem): Handle | undefined => {
    if (item.locked || item.hidden) return undefined;
    if (item.points?.length) {
      const centre = pathCentre(item.points);
      return near(at, { x: centre.x, y: centre.y - 44 / 570 }, .025) ? 'rotate' : undefined;
    }
    const x = item.x ?? .5, y = item.y ?? .5, w = item.w ?? .1, h = item.h ?? .1;
    const centre = { x, y };
    if (near(at, rotateAround({ x, y: y - (resizableKinds.includes(item.kind) ? h / 2 + 37 / 570 : 59 / 570) }, centre, item.rotation ?? 0), .025)) return 'rotate';
    if (!resizableKinds.includes(item.kind)) return undefined;
    for (const [handle, px, py] of [
      ['nw', x-w/2, y-h/2], ['ne', x+w/2, y-h/2], ['sw', x-w/2, y+h/2], ['se', x+w/2, y+h/2],
    ] as const) if (near(at, rotateAround({ x: px, y: py }, centre, item.rotation ?? 0), .03)) return handle;
    return undefined;
  };
  const hitAt = (at: Point) => draft.items.slice().reverse().find(item => {
    if (item.hidden || item.locked) return false;
    if (item.points?.length) {
      return item.points.some(vertex => near(at, vertex, .035)) || item.points.slice(1).some((end, index) => distanceToSegment(at, item.points![index], end) < .024);
    }
    const local = rotateAround(at, { x: item.x ?? .5, y: item.y ?? .5 }, -(item.rotation ?? 0));
    const dx = Math.abs((item.x ?? .5) - local.x), dy = Math.abs((item.y ?? .5) - local.y);
    return dx <= Math.max(.04, (item.w ?? .08) / 2) && dy <= Math.max(.04, (item.h ?? .08) / 2);
  });
  const finishPath = () => {
    const points = pendingPath.filter((value, index) => index === 0 || !near(value, pendingPath[index - 1], .008));
    if (points.length < 2) { setError('Click at least two points to draw the line.'); return; }
    const item: MapItem = { id: crypto.randomUUID(), kind: tool as MapItemKind, points };
    changeDraft(value => ({ ...value, items: [...value.items, item] }));
    setPendingPath([]); setHoverPoint(null); setTool('select'); selectIds([item.id]); setError('');
  };
  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    const at = point(event);
    if (isPath(tool)) {
      setPendingPath(value => [...value, event.shiftKey && value.length ? straightPoint(value[value.length - 1], at) : at]);
      setError('');
      return;
    }
    if (tool !== 'select') { place(tool as MapItemKind, at); return; }
    if (current) {
      const handle = handleAt(at, current);
      if (handle) {
        dragging.current = { id: current.id, item: { ...current }, start: at, mode: handle === 'rotate' ? 'rotate' : 'resize', handle };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    const hit = hitAt(at);
    selectIds(hit ? [hit.id] : []);
    setNamingId('');
    if (!hit) {
      if (draft.backgroundImage && draft.backgroundLocked === false) {
        backgroundDrag.current = { start: at, x: draft.backgroundOffsetX || 0, y: draft.backgroundOffsetY || 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    const vertex = hit.points?.findIndex(value => near(at, value, .035));
    const groupItems = hit.groupId ? copyMap({ kind: 'map', title: '', items: draft.items.filter(item => item.groupId === hit.groupId && !item.locked && !item.hidden) }).items : undefined;
    dragging.current = { id: hit.id, item: copyMap({ kind: 'map', title: '', items: [hit] }).items[0], start: at, mode: groupItems ? 'move' : vertex !== undefined && vertex >= 0 ? 'vertex' : 'move', vertex, groupItems };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const at = point(event);
    if (isPath(tool)) { if (pendingPath.length) setHoverPoint(event.shiftKey ? straightPoint(pendingPath[pendingPath.length - 1], at) : at); return; }
    const imageDrag = backgroundDrag.current;
    if (imageDrag && event.currentTarget.hasPointerCapture(event.pointerId)) {
      if (near(at, imageDrag.start, .003)) return;
      if (!imageDrag.recorded) { checkpoint(); imageDrag.recorded = true; }
      changeDraft(value => ({ ...value, backgroundOffsetX: clamp(imageDrag.x + (at.x - imageDrag.start.x) * 2, -1, 1), backgroundOffsetY: clamp(imageDrag.y + (at.y - imageDrag.start.y) * 2, -1, 1) }), false);
      return;
    }
    const drag = dragging.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = at.x - drag.start.x, dy = at.y - drag.start.y;
    if (Math.hypot(dx, dy) < .003) return;
    if (!drag.recorded) { checkpoint(); drag.recorded = true; }
    const item = drag.item;
    if (drag.mode === 'rotate') {
      if (item.points?.length) {
        const centre = pathCentre(item.points);
        const angle = (point: Point) => Math.atan2((point.y - centre.y) * 570, (point.x - centre.x) * 920);
        const delta = (angle(at) - angle(drag.start)) * 180 / Math.PI;
        modify({ points: item.points.map(point => rotateAround(point, centre, delta)), rotation: Math.round((item.rotation ?? 0) + delta) }, drag.id, false);
      } else {
        const angle = Math.atan2((at.y - (item.y ?? .5)) * 570, (at.x - (item.x ?? .5)) * 920);
        modify({ rotation: Math.round((angle + Math.PI / 2) * 180 / Math.PI) }, drag.id, false);
      }
    } else if (drag.mode === 'resize') {
      const centre = { x: item.x ?? .5, y: item.y ?? .5 };
      const startLocal = rotateAround(drag.start, centre, -(item.rotation ?? 0));
      const atLocal = rotateAround(at, centre, -(item.rotation ?? 0));
      const sideX = drag.handle?.endsWith('e') ? 1 : -1;
      const sideY = drag.handle?.startsWith('s') ? 1 : -1;
      const w = clamp((item.w ?? .1) + (atLocal.x - startLocal.x) * sideX, .025, 1);
      const h = clamp((item.h ?? .1) + (atLocal.y - startLocal.y) * sideY, .025, 1);
      const shifted = rotateAround({ x: centre.x + (w - (item.w ?? .1)) * sideX / 2, y: centre.y + (h - (item.h ?? .1)) * sideY / 2 }, centre, item.rotation ?? 0);
      modify({ w, h, x: clamp(shifted.x, w / 2, 1-w/2), y: clamp(shifted.y, h/2, 1-h/2) }, drag.id, false);
    } else if (drag.mode === 'vertex') {
      modify({ points: item.points?.map((value, index) => index === drag.vertex ? { x: clamp(value.x + dx), y: clamp(value.y + dy) } : value) }, drag.id, false);
    } else {
      if (drag.groupItems?.length) {
        const originals = new Map(drag.groupItems.map(value => [value.id, value]));
        changeDraft(value => ({ ...value, items: value.items.map(currentItem => {
          const original = originals.get(currentItem.id);
          return original ? { ...currentItem, x: original.x === undefined ? undefined : clamp(original.x + dx), y: original.y === undefined ? undefined : clamp(original.y + dy), points: original.points?.map(point => ({ x: clamp(point.x + dx), y: clamp(point.y + dy) })) } : currentItem;
        }) }), false);
      } else modify({ x: item.x === undefined ? undefined : clamp(item.x + dx), y: item.y === undefined ? undefined : clamp(item.y + dy), points: item.points?.map(value => ({ x: clamp(value.x + dx), y: clamp(value.y + dy) })) }, drag.id, false);
    }
  };
  const up = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragging.current = null;
    backgroundDrag.current = null;
  };
  const chooseTool = (next: MapTool, symbol?: string) => {
    if (pendingPath.length) { setPendingPath([]); setHoverPoint(null); }
    if (symbol) setIconKey(symbol);
    if (next !== 'select') selectIds([]);
    setTool(next); setNamingId(''); setError('');
  };
  const changeSymbolStyle = (style: 'plain' | 'shaded') => {
    setSymbolStyle(style);
    if (tool === 'select' && current?.kind === 'icon') modify({ iconStyle: style });
  };
  const changeSymbolColor = (color: string) => {
    setSymbolColor(color);
    if (tool === 'select' && current?.kind === 'icon') modify({ iconColor: color });
  };
  const choosePreset = (name: string, figure: MapFigure) => {
    const next = { name, figure: copyMap(figure) };
    if (draft.items.length > 1 || !!draft.backgroundImage) { setPendingPreset(next); return; }
    changeDraft(next.figure); selectIds([]); setBackground(undefined);
  };
  const importImage = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPG, WebP or SVG image.');
      const { id } = await storePicture(cx.d.id, file);
      const image = await loadPicture(cx.d.id, id);
      setBackground(image);
      changeDraft(value => ({ ...value, backgroundImage: id, backgroundLocked: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t add this image. Try another picture.');
    } finally {
      setBusy(false);
      if (upload.current) upload.current.value = '';
    }
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    const key = event.dataTransfer.getData('application/x-elt-map-symbol');
    if (!key || !MAP_ICONS.some(([value]) => value === key)) return;
    event.preventDefault();
    place('icon', pointFromClient(event.clientX, event.clientY), key);
  };
  const save = () => { set({ figure: draft }, 'map-edit'); onClose(); };

  return <div className="dz-figure-modal" role="dialog" aria-modal="true" aria-label="Edit map"><div className="dz-figure-dialog dz-map-dialog dz-map-editor">
    <header><span><strong>Edit map</strong><small>Make a clear plan, then use it in a Classes task.</small></span><button type="button" onClick={onClose} aria-label="Close map editor">×</button></header>
    <div className="dz-figure-work"><div className="dz-map-tools">
      <div className="dz-map-tools-heading"><strong>Map tools</strong></div>
      <button type="button" className={tool === 'select' ? 'dz-map-pick on' : 'dz-map-pick'} onClick={() => chooseTool('select')}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 2v15l4-4 3 5 2-1-3-5h6L3 2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>Select and move</button>
      <details className="dz-map-tool-section" open><summary>Draw lines</summary><div className="dz-map-tool-grid">{pathKinds.map(kind => <button type="button" key={kind} className={tool === kind ? 'on' : ''} onClick={() => chooseTool(kind)} aria-pressed={tool === kind}><MapToolIcon kind={kind} size={20} /><span>{labelOf(kind)}</span></button>)}</div><p className="dz-map-muted dz-map-shift-hint">Hold Shift while drawing for a straight segment.</p></details>
      <details className="dz-map-tool-section dz-map-symbol-section" open><summary>Symbols</summary><div className="dz-map-toolgroup"><MapSymbolLibrary selectedKey={tool === 'icon' ? iconKey : undefined} symbolStyle={tool === 'select' && current?.kind === 'icon' ? current.iconStyle || 'shaded' : symbolStyle} symbolColor={tool === 'select' && current?.kind === 'icon' ? current.iconColor || '#302e31' : symbolColor} onSymbolStyleChange={changeSymbolStyle} onSymbolColorChange={changeSymbolColor} onSelect={key => { chooseTool('icon', key); if (window.innerWidth <= 900) requestAnimationFrame(() => center.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} /></div></details>
      <details className="dz-map-tool-section"><summary>Add places</summary><div className="dz-map-tool-grid">{placeKinds.map(kind => <button type="button" key={kind} className={tool === kind ? 'on' : ''} onClick={() => chooseTool(kind)} aria-pressed={tool === kind}><MapToolIcon kind={kind} size={20} /><span>{labelOf(kind)}</span></button>)}</div></details>
      <details className="dz-map-tool-section"><summary>Letters and names</summary><div className="dz-map-toolgroup"><div className="dz-map-tool-grid"><button type="button" className={tool === 'marker' ? 'on' : ''} onClick={() => chooseTool('marker')} aria-pressed={tool === 'marker'}><span className="dz-map-tool-letter">A</span><span>Add next letter ({nextLetter(draft.items)})</span></button><button type="button" className={tool === 'label' ? 'on' : ''} onClick={() => chooseTool('label')} aria-pressed={tool === 'label'}><span className="dz-map-tool-letter">T</span><span>Add text label</span></button><button type="button" className={tool === 'compass' ? 'on' : ''} onClick={() => chooseTool('compass')} aria-pressed={tool === 'compass'}><span className="dz-map-tool-letter">↑</span><span>Add north arrow</span></button></div><MapMarkerKey items={draft.items} onChangeItems={items => changeDraft(value => ({ ...value, items }))} /></div></details>
      <details className="dz-map-tool-section"><summary>Layout and reference image</summary><div className="dz-map-toolgroup">
        <Field name="Map title" value={draft.title} onChange={title => changeDraft(value => ({ ...value, title }))} />
        <strong>Ready-made layouts</strong><div className="dz-map-start-list">
          <button type="button" onClick={() => choosePreset('Blank map', blankMap())}><MapLayoutThumbnail figure={blankMap()} /><b>Blank map</b><small>Start with an empty plan</small></button>
          {MAP_PRESETS.filter(preset => ['park','site','airport','town-now','town','castle'].includes(preset.id)).map(preset => <button type="button" key={preset.id} onClick={() => choosePreset(preset.name, preset.figure as MapFigure)}><MapLayoutThumbnail figure={preset.figure as MapFigure} /><b>{preset.name}</b><small>{preset.about}</small></button>)}
        </div><p className="dz-map-muted">For a before-and-after pair, choose the two-map layout in Charts & maps.</p>
        <strong>Trace your own plan</strong><input ref={upload} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={event => void importImage(event.target.files?.[0])} /><button type="button" onClick={() => upload.current?.click()} disabled={busy}>{busy ? 'Importing…' : 'Import map image'}</button>
        {draft.backgroundImage && <><label>Fit<NSelect value={draft.backgroundFit || 'contain'} onChange={event => changeDraft(value => ({ ...value, backgroundFit: event.target.value as 'contain' | 'cover' }))}><option value="contain">Show the whole image</option><option value="cover">Fill the map</option></NSelect></label><label>Image opacity <input type="range" min="10" max="100" value={Math.round((draft.backgroundOpacity ?? 1) * 100)} onChange={event => changeDraft(value => ({ ...value, backgroundOpacity: Number(event.target.value) / 100 }))} /></label><label className="dz-map-check"><input type="checkbox" checked={draft.backgroundLocked !== false} onChange={event => changeDraft(value => ({ ...value, backgroundLocked: event.target.checked }))} /> Lock the reference image</label>{draft.backgroundLocked === false && <><p className="dz-map-muted">Drag an empty map area to move the reference.</p><label>Move left or right<input type="range" min="-100" max="100" value={Math.round((draft.backgroundOffsetX || 0) * 100)} onChange={event => changeDraft(value => ({ ...value, backgroundOffsetX: Number(event.target.value) / 100 }))} /></label><label>Move up or down<input type="range" min="-100" max="100" value={Math.round((draft.backgroundOffsetY || 0) * 100)} onChange={event => changeDraft(value => ({ ...value, backgroundOffsetY: Number(event.target.value) / 100 }))} /></label></>}<button type="button" onClick={() => { changeDraft(value => ({ ...value, backgroundImage: undefined })); setBackground(undefined); }}>Remove image</button></>}
        <strong>Drawing aids</strong><label className="dz-map-check"><input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} /> Show grid</label><label className="dz-map-check"><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} /> Snap to grid</label><label className="dz-map-check"><input type="checkbox" checked={draft.showBorder !== false} onChange={event => changeDraft(value => ({ ...value, showBorder: event.target.checked }))} /> Show map border</label>
      </div></details>
      {pendingPreset && <div className="dz-map-confirm" role="alertdialog" aria-label="Replace current map"><strong>Replace the current map?</strong><p>Choosing {pendingPreset.name} removes the objects and reference image in this map. Your saved design stays as it is until you save.</p><div><button type="button" onClick={() => setPendingPreset(null)}>Keep this map</button><button type="button" onClick={() => { changeDraft(pendingPreset.figure); setBackground(undefined); selectIds([]); setPendingPreset(null); }}>Replace map</button></div></div>}
      {error && <p role="alert" className="dz-map-error">{error}</p>}
    </div>
    <div ref={center} className={`dz-map-center dz-map-preview-${previewSize}${zoom > 1 ? ' is-zoomed' : ''}`}>
      <MapHistoryToolbar canUndo={history.current.past.length > 0} canRedo={history.current.future.length > 0} onUndo={() => travel('undo')} onRedo={() => travel('redo')} />
      {isPath(tool) && <div className="dz-map-path-actions"><span>{pendingPath.length ? `${pendingPath.length} point${pendingPath.length === 1 ? '' : 's'} placed` : 'Click the starting point'}</span><button type="button" disabled={pendingPath.length < 2} onClick={finishPath}>Finish line</button><button type="button" disabled={!pendingPath.length} onClick={() => { setPendingPath([]); setHoverPoint(null); }}>Cancel line</button></div>}
      <div className="dz-map-zoom"><button type="button" onClick={() => setZoom(value => Math.max(.75, value - .25))} aria-label="Zoom map out">−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(value => Math.min(2.5, value + .25))} aria-label="Zoom map in">+</button></div>
      <div className="dz-map-view-switch" role="group" aria-label="Preview map at"><span>Preview</span>{(['class','phone','print'] as const).map(size => <button type="button" key={size} className={previewSize === size ? 'on' : ''} aria-pressed={previewSize === size} onClick={() => setPreviewSize(size)}>{size === 'class' ? 'Class' : size === 'phone' ? 'Phone' : 'Print'}</button>)}</div>
      <div ref={canvasWrap} className="dz-map-canvas-wrap" style={{ width: `${(fitWidth || 600) * zoom}px` }} onDragOver={event => { if (Array.from(event.dataTransfer.types).includes('application/x-elt-map-symbol')) event.preventDefault(); }} onDrop={drop}>
        <canvas ref={canvas} width={1000} height={720} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => { if (isPath(tool)) finishPath(); }} aria-label="Editable map canvas" />
        {naming && !naming.points && <input ref={nameInput} className="dz-map-inline-name" aria-label="Name this map object" placeholder="Name or letter" value={naming.label || ''} style={{ left: `${4 + (naming.x ?? .5) * 92}%`, top: `${(88 + (naming.y ?? .5) * 570) / 720 * 100}%` }} onChange={event => modify({ label: event.target.value }, naming.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); setNamingId(''); } }} />}
      </div>
    </div>
    <div className="dz-map-inspector"><strong>{current ? `Selected ${labelOf(current.kind)}` : 'Map layers'}</strong>
      {current ? <>
        <Field name="Name or letter" value={current.label || ''} onChange={label => modify({ label })} />
        {current.kind === 'icon' && <>
          <label className="dz-field"><span>Symbol</span><NSelect value={current.icon} onChange={event => modify({ icon: event.target.value })}>{MAP_ICONS.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</NSelect></label>
          <div className="dz-map-icon-appearance" role="group" aria-label="Selected symbol appearance"><span>Symbol background</span><div><button type="button" className={current.iconStyle === 'plain' ? 'on' : ''} aria-pressed={current.iconStyle === 'plain'} onClick={() => changeSymbolStyle('plain')}>Plain</button><button type="button" className={current.iconStyle !== 'plain' ? 'on' : ''} aria-pressed={current.iconStyle !== 'plain'} onClick={() => changeSymbolStyle('shaded')}>Shaded</button></div><label>Colour<input type="color" value={current.iconColor || '#302e31'} onChange={event => changeSymbolColor(event.target.value)} aria-label="Selected symbol colour" /></label></div>
        </>}
        {!current.points && <details className="dz-map-advanced"><summary>Exact position and size</summary><NumberField name="Across (%)" value={Math.round((current.x ?? .5) * 100)} onChange={value => modify({ x: clamp((value ?? 50) / 100) })} /><NumberField name="Down (%)" value={Math.round((current.y ?? .5) * 100)} onChange={value => modify({ y: clamp((value ?? 50) / 100) })} />{resizableKinds.includes(current.kind) && <><NumberField name="Width (%)" value={Math.round((current.w ?? .1) * 100)} onChange={value => modify({ w: clamp((value ?? 10) / 100, .025, 1) })} /><NumberField name="Height (%)" value={Math.round((current.h ?? .1) * 100)} onChange={value => modify({ h: clamp((value ?? 10) / 100, .025, 1) })} /></>}</details>}
        <NumberField name="Rotation (°)" value={Math.round(current.rotation ?? 0)} onChange={value => {
          const rotation = value ?? 0;
          if (current.points?.length) {
            const centre = pathCentre(current.points);
            modify({ rotation, points: current.points.map(point => rotateAround(point, centre, rotation - (current.rotation ?? 0))) });
          } else modify({ rotation });
        }} />
        {['building','room','zone'].includes(current.kind) && <label className="dz-field"><span>Fill colour</span><input type="color" value={current.fill || '#ffffff'} onChange={event => modify({ fill: event.target.value })} /></label>}
        <div className="dz-map-layer-actions"><button type="button" onClick={() => { changeDraft(value => ({ ...value, items: value.items.filter(item => item.id !== selected) })); selectIds([]); }}>Delete</button><button type="button" onClick={() => { const copy = { ...current, id: crypto.randomUUID(), x: clamp((current.x ?? .5) + .04), y: clamp((current.y ?? .5) + .04), points: current.points?.map(point => ({ x: clamp(point.x + .04), y: clamp(point.y + .04) })) }; changeDraft(value => ({ ...value, items: [...value.items, copy] })); selectIds([copy.id]); }}>Duplicate</button></div>
      </> : null}
      <MapLayersPanel items={draft.items} selectedIds={selectedIds} onSelectIds={ids => { chooseTool('select'); selectIds(ids); }} onChangeItems={items => { changeDraft(value => ({ ...value, items })); selectIds(selectedIds.filter(id => items.some(item => item.id === id && !item.hidden && !item.locked))); }} />
    </div></div>
    <footer><span className="dz-map-save-status" role="status">{hasUnsavedChanges ? 'Unsaved changes' : 'No changes to save'}</span><button type="button" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={save}>Save map</button></footer>
  </div></div>;
}

import { useEffect, useRef, useState, type DragEvent, type PointerEvent, type Ref } from 'react';
import { loadPicture, storePicture, type El } from './model';
import type { Ctx } from './Editor';
import { blankMap, cloneFigure, makeMapItem, MAP_PRESETS, mapPointFromCanvas } from './figureTemplates';
import { drawFigure, MAP_ICONS, type MapFigure, type MapItem, type MapItemKind, type Point } from './figures';
import MapSymbolLibrary from './MapSymbolLibrary';

type MapTool = 'select' | MapItemKind;
type MapTab = 'layout' | 'places' | 'labels' | 'finish';
type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'rotate';
type Dragging = { id: string; item: MapItem; start: Point; mode: 'move' | 'vertex' | 'resize' | 'rotate'; vertex?: number; handle?: Handle };

const pathKinds: MapItemKind[] = ['road', 'river', 'footpath', 'wall', 'fence', 'bridge'];
const placeKinds: MapItemKind[] = ['building', 'room', 'zone', 'water', 'roundabout', 'tree', 'gate'];
const resizableKinds: MapItemKind[] = ['building', 'room', 'zone', 'water', 'roundabout', 'icon'];
const tabs: { key: MapTab; label: string; help: string }[] = [
  { key: 'layout', label: '1 Layout', help: 'Start with a plan or trace your own image.' },
  { key: 'places', label: '2 Places', help: 'Draw paths and place buildings, facilities and landmarks.' },
  { key: 'labels', label: '3 Labels', help: 'Add letters, names and a north arrow.' },
  { key: 'finish', label: '4 Finish', help: 'Check the plan before using it in Classes.' },
];
const labelOf = (kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1).replace(/([A-Z])/g, ' $1');
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const copyMap = (figure: MapFigure) => cloneFigure(figure) as MapFigure;
const isPath = (kind: MapTool) => pathKinds.includes(kind as MapItemKind);
const near = (a: Point, b: Point, distance = .03) => Math.hypot(a.x - b.x, a.y - b.y) <= distance;
const snapValue = (value: number) => clamp(Math.round(value / .05) * .05);
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

export default function MapEditor({ cx, e, set, onClose }: { cx: Ctx; e: El; set: (patch: Partial<El>, key?: string) => void; onClose: () => void }) {
  const initial = e.figure as MapFigure;
  const [draft, setDraft] = useState<MapFigure>(() => copyMap(initial));
  const [activeTab, setActiveTab] = useState<MapTab>(initial.title === 'New map' ? 'layout' : 'places');
  const [tool, setTool] = useState<MapTool>('select');
  const [iconKey, setIconKey] = useState('café');
  const [selected, setSelected] = useState('');
  const [namingId, setNamingId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [snap, setSnap] = useState(false);
  const [pendingPath, setPendingPath] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [pendingPreset, setPendingPreset] = useState<{ name: string; figure: MapFigure } | null>(null);
  const [previewSize, setPreviewSize] = useState<'class' | 'phone' | 'print'>('class');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [background, setBackground] = useState<CanvasImageSource | undefined>(() => initial.backgroundImage ? cx.imgs.get(initial.backgroundImage) : undefined);
  const canvas = useRef<HTMLCanvasElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const dragging = useRef<Dragging | null>(null);
  const backgroundDrag = useRef<{ start: Point; x: number; y: number } | null>(null);
  const current = draft.items.find(item => item.id === selected);
  const naming = draft.items.find(item => item.id === namingId);

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
      } else {
        const x = 40 + (current.x ?? .5) * 920, y = 88 + (current.y ?? .5) * 570;
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
  const modify = (patch: Partial<MapItem>, id = selected) => setDraft(value => ({
    ...value, items: value.items.map(item => item.id === id ? { ...item, ...patch } : item),
  }));
  const place = (kind: MapItemKind, at: Point, symbol = iconKey) => {
    const item = makeMapItem(kind, at.x, at.y, symbol);
    if (kind === 'icon') item.label = MAP_ICONS.find(([key]) => key === symbol)?.[1] || 'Place';
    if (kind === 'marker') item.label = nextLetter(draft.items);
    setDraft(value => ({ ...value, items: [...value.items, item] }));
    setSelected(item.id);
    setNamingId(item.id);
    setTool('select');
    setError('');
  };
  const handleAt = (at: Point, item: MapItem): Handle | undefined => {
    if (item.locked || item.hidden || !resizableKinds.includes(item.kind)) return undefined;
    const x = item.x ?? .5, y = item.y ?? .5, w = item.w ?? .1, h = item.h ?? .1;
    if (near(at, { x, y: y - h / 2 - 37 / 570 }, .025)) return 'rotate';
    for (const [handle, px, py] of [
      ['nw', x-w/2, y-h/2], ['ne', x+w/2, y-h/2], ['sw', x-w/2, y+h/2], ['se', x+w/2, y+h/2],
    ] as const) if (near(at, { x: px, y: py }, .03)) return handle;
    return undefined;
  };
  const hitAt = (at: Point) => draft.items.slice().reverse().find(item => {
    if (item.hidden) return false;
    if (item.points?.length) {
      return item.points.some(vertex => near(at, vertex, .035)) || item.points.slice(1).some((end, index) => distanceToSegment(at, item.points![index], end) < .024);
    }
    const dx = Math.abs((item.x ?? .5) - at.x), dy = Math.abs((item.y ?? .5) - at.y);
    return dx <= Math.max(.04, (item.w ?? .08) / 2) && dy <= Math.max(.04, (item.h ?? .08) / 2);
  });
  const finishPath = () => {
    const points = pendingPath.filter((value, index) => index === 0 || !near(value, pendingPath[index - 1], .008));
    if (points.length < 2) { setError('Click at least two points to draw the line.'); return; }
    const item: MapItem = { id: crypto.randomUUID(), kind: tool as MapItemKind, points };
    setDraft(value => ({ ...value, items: [...value.items, item] }));
    setPendingPath([]); setHoverPoint(null); setTool('select'); setSelected(item.id); setError('');
  };
  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    const at = point(event);
    if (isPath(tool)) {
      setPendingPath(value => [...value, at]);
      setError('');
      return;
    }
    if (tool !== 'select') { place(tool as MapItemKind, at); return; }
    if (current && !current.points) {
      const handle = handleAt(at, current);
      if (handle) {
        dragging.current = { id: current.id, item: { ...current }, start: at, mode: handle === 'rotate' ? 'rotate' : 'resize', handle };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    const hit = hitAt(at);
    setSelected(hit?.id || '');
    setNamingId('');
    if (!hit) {
      if (activeTab === 'layout' && draft.backgroundImage && draft.backgroundLocked === false) {
        backgroundDrag.current = { start: at, x: draft.backgroundOffsetX || 0, y: draft.backgroundOffsetY || 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (hit.locked) return;
    const vertex = hit.points?.findIndex(value => near(at, value, .035));
    dragging.current = { id: hit.id, item: copyMap({ kind: 'map', title: '', items: [hit] }).items[0], start: at, mode: vertex !== undefined && vertex >= 0 ? 'vertex' : 'move', vertex };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const at = point(event);
    if (isPath(tool)) { if (pendingPath.length) setHoverPoint(at); return; }
    const imageDrag = backgroundDrag.current;
    if (imageDrag && event.currentTarget.hasPointerCapture(event.pointerId)) {
      setDraft(value => ({ ...value, backgroundOffsetX: clamp(imageDrag.x + (at.x - imageDrag.start.x) * 2, -1, 1), backgroundOffsetY: clamp(imageDrag.y + (at.y - imageDrag.start.y) * 2, -1, 1) }));
      return;
    }
    const drag = dragging.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = at.x - drag.start.x, dy = at.y - drag.start.y;
    const item = drag.item;
    if (drag.mode === 'rotate') {
      const angle = Math.atan2(at.y - (item.y ?? .5), at.x - (item.x ?? .5));
      modify({ rotation: Math.round((angle + Math.PI / 2) * 180 / Math.PI) }, drag.id);
    } else if (drag.mode === 'resize') {
      const sideX = drag.handle?.endsWith('e') ? 1 : -1;
      const sideY = drag.handle?.startsWith('s') ? 1 : -1;
      const w = clamp((item.w ?? .1) + dx * sideX, .025, 1);
      const h = clamp((item.h ?? .1) + dy * sideY, .025, 1);
      modify({ w, h, x: clamp((item.x ?? .5) + (w - (item.w ?? .1)) * sideX / 2, w / 2, 1-w/2), y: clamp((item.y ?? .5) + (h - (item.h ?? .1)) * sideY / 2, h/2, 1-h/2) }, drag.id);
    } else if (drag.mode === 'vertex') {
      modify({ points: item.points?.map((value, index) => index === drag.vertex ? { x: clamp(value.x + dx), y: clamp(value.y + dy) } : value) }, drag.id);
    } else {
      modify({ x: item.x === undefined ? undefined : clamp(item.x + dx), y: item.y === undefined ? undefined : clamp(item.y + dy), points: item.points?.map(value => ({ x: clamp(value.x + dx), y: clamp(value.y + dy) })) }, drag.id);
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
    setTool(next); setNamingId(''); setError('');
  };
  const choosePreset = (name: string, figure: MapFigure) => {
    const next = { name, figure: copyMap(figure) };
    if (draft.items.length > 1 || !!draft.backgroundImage) { setPendingPreset(next); return; }
    setDraft(next.figure); setSelected(''); setBackground(undefined);
  };
  const importImage = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPG, WebP or SVG image.');
      const { id } = await storePicture(cx.d.id, file);
      const image = await loadPicture(cx.d.id, id);
      setBackground(image);
      setDraft(value => ({ ...value, backgroundImage: id, backgroundLocked: true }));
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
    <div className="dz-map-tabs" role="tablist" aria-label="Map editing steps">{tabs.map(tab => <button type="button" role="tab" key={tab.key} aria-selected={activeTab === tab.key} className={activeTab === tab.key ? 'on' : ''} onClick={() => { setActiveTab(tab.key); chooseTool('select'); }}>{tab.label}</button>)}</div>
    <div className="dz-figure-work"><div className="dz-map-tools">
      <p className="dz-map-tab-help">{tabs.find(tab => tab.key === activeTab)?.help}</p>
      {activeTab === 'layout' && <>
        <Field name="Map title" value={draft.title} onChange={title => setDraft(value => ({ ...value, title }))} />
        <div className="dz-map-toolgroup"><strong>Start with a layout</strong><div className="dz-map-start-list">
          <button type="button" onClick={() => choosePreset('Blank map', blankMap())}>Blank map</button>
          {MAP_PRESETS.filter(preset => ['park','site','airport','town-now','town','castle'].includes(preset.id)).map(preset => <button type="button" key={preset.id} onClick={() => choosePreset(preset.name, preset.figure as MapFigure)}><b>{preset.name}</b><small>{preset.about}</small></button>)}
        </div><p className="dz-map-muted">For a before-and-after pair, choose the two-map layout in Charts & maps.</p></div>
        <div className="dz-map-toolgroup"><strong>Trace an existing plan</strong><input ref={upload} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={event => void importImage(event.target.files?.[0])} /><button type="button" onClick={() => upload.current?.click()} disabled={busy}>{busy ? 'Importing…' : 'Import map image'}</button>
          {draft.backgroundImage && <><label>Fit<select value={draft.backgroundFit || 'contain'} onChange={event => setDraft(value => ({ ...value, backgroundFit: event.target.value as 'contain' | 'cover' }))}><option value="contain">Show the whole image</option><option value="cover">Fill the map</option></select></label><label>Image opacity <input type="range" min="10" max="100" value={Math.round((draft.backgroundOpacity ?? 1) * 100)} onChange={event => setDraft(value => ({ ...value, backgroundOpacity: Number(event.target.value) / 100 }))} /></label><label className="dz-map-check"><input type="checkbox" checked={draft.backgroundLocked !== false} onChange={event => setDraft(value => ({ ...value, backgroundLocked: event.target.checked }))} /> Lock the reference image</label>{draft.backgroundLocked === false && <><p className="dz-map-muted">Drag the empty map area to move the reference image.</p><label>Move left or right<input type="range" min="-100" max="100" value={Math.round((draft.backgroundOffsetX || 0) * 100)} onChange={event => setDraft(value => ({ ...value, backgroundOffsetX: Number(event.target.value) / 100 }))} /></label><label>Move up or down<input type="range" min="-100" max="100" value={Math.round((draft.backgroundOffsetY || 0) * 100)} onChange={event => setDraft(value => ({ ...value, backgroundOffsetY: Number(event.target.value) / 100 }))} /></label></>}<button type="button" onClick={() => { setDraft(value => ({ ...value, backgroundImage: undefined })); setBackground(undefined); }}>Remove image</button></>}
        </div>
        <div className="dz-map-toolgroup"><strong>Drawing aid</strong><label className="dz-map-check"><input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} /> Show grid</label><label className="dz-map-check"><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} /> Snap to grid</label></div>
      </>}
      {activeTab === 'places' && <>
        <button type="button" className={tool === 'select' ? 'dz-map-pick on' : 'dz-map-pick'} onClick={() => chooseTool('select')}>Select and move</button>
        <div className="dz-map-toolgroup"><strong>Draw lines</strong><div>{pathKinds.map(kind => <button type="button" key={kind} className={tool === kind ? 'on' : ''} onClick={() => chooseTool(kind)}>{labelOf(kind)}</button>)}</div></div>
        <div className="dz-map-toolgroup"><strong>Add places</strong><div>{placeKinds.map(kind => <button type="button" key={kind} className={tool === kind ? 'on' : ''} onClick={() => chooseTool(kind)}>{labelOf(kind)}</button>)}</div></div>
        <div className="dz-map-toolgroup"><strong>Symbols</strong><p className="dz-map-muted">Click a symbol, then click the map. Or drag it onto the map.</p><MapSymbolLibrary selectedKey={tool === 'icon' ? iconKey : undefined} onSelect={key => chooseTool('icon', key)} /></div>
      </>}
      {activeTab === 'labels' && <>
        <div className="dz-map-toolgroup"><strong>Letters and names</strong><p className="dz-map-muted">Pick a marker, then click the map. Its letter can be changed beside the point.</p><button type="button" className={tool === 'marker' ? 'on' : ''} onClick={() => chooseTool('marker')}>Add next letter ({nextLetter(draft.items)})</button><button type="button" className={tool === 'label' ? 'on' : ''} onClick={() => chooseTool('label')}>Add text label</button><button type="button" className={tool === 'compass' ? 'on' : ''} onClick={() => chooseTool('compass')}>Add north arrow</button></div>
        <div className="dz-map-toolgroup"><strong>Existing labels</strong>{draft.items.filter(item => !!item.label).map(item => <button type="button" key={item.id} onClick={() => { chooseTool('select'); setSelected(item.id); setNamingId(item.id); }}>{item.label}</button>)}</div>
      </>}
      {activeTab === 'finish' && <>
        <Field name="Map title" value={draft.title} onChange={title => setDraft(value => ({ ...value, title }))} />
        <label className="dz-map-check"><input type="checkbox" checked={draft.showBorder !== false} onChange={event => setDraft(value => ({ ...value, showBorder: event.target.checked }))} /> Show map border</label>
        <div className="dz-map-toolgroup"><strong>Preview size</strong><div>{(['class','phone','print'] as const).map(size => <button type="button" key={size} className={previewSize === size ? 'on' : ''} onClick={() => setPreviewSize(size)}>{size === 'class' ? 'Class' : size === 'phone' ? 'Phone' : 'Print'}</button>)}</div><p className="dz-map-muted">The same map is used on screen and on paper. Questions and answers are added in Classes.</p></div>
        <p className="dz-map-summary">{draft.items.length} map objects · {draft.items.filter(item => item.kind === 'marker').length} letter markers</p>
      </>}
      {pendingPreset && <div className="dz-map-confirm" role="alertdialog" aria-label="Replace current map"><strong>Replace the current map?</strong><p>Choosing {pendingPreset.name} removes the objects and reference image in this map. Your saved design stays as it is until you save.</p><div><button type="button" onClick={() => setPendingPreset(null)}>Keep this map</button><button type="button" onClick={() => { setDraft(pendingPreset.figure); setBackground(undefined); setSelected(''); setPendingPreset(null); }}>Replace map</button></div></div>}
      {error && <p role="alert" className="dz-map-error">{error}</p>}
    </div>
    <div className={`dz-map-center dz-map-preview-${previewSize}`}>
      <div className="dz-map-instruction">{isPath(tool) ? `Click to draw a ${tool}. Add bends, then finish the line.` : tool === 'select' ? 'Click an object to edit it. Drag its handles to resize or rotate.' : `Click the map to place ${tool === 'icon' ? MAP_ICONS.find(([key]) => key === iconKey)?.[1] : labelOf(tool)}.`}</div>
      {isPath(tool) && <div className="dz-map-path-actions"><span>{pendingPath.length ? `${pendingPath.length} point${pendingPath.length === 1 ? '' : 's'} placed` : 'Click the starting point'}</span><button type="button" disabled={pendingPath.length < 2} onClick={finishPath}>Finish line</button><button type="button" disabled={!pendingPath.length} onClick={() => { setPendingPath([]); setHoverPoint(null); }}>Cancel line</button></div>}
      <div className="dz-map-zoom"><button type="button" onClick={() => setZoom(value => Math.max(.75, value - .25))} aria-label="Zoom map out">−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(value => Math.min(2.5, value + .25))} aria-label="Zoom map in">+</button></div>
      <div className="dz-map-canvas-wrap" style={{ width: `${zoom * 100}%` }} onDragOver={event => { if (Array.from(event.dataTransfer.types).includes('application/x-elt-map-symbol')) event.preventDefault(); }} onDrop={drop}>
        <canvas ref={canvas} width={1000} height={720} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={() => { if (isPath(tool)) finishPath(); }} aria-label="Editable map canvas" />
        {naming && !naming.points && <input ref={nameInput} className="dz-map-inline-name" aria-label="Name this map object" placeholder="Name or letter" value={naming.label || ''} style={{ left: `${4 + (naming.x ?? .5) * 92}%`, top: `${(88 + (naming.y ?? .5) * 570) / 720 * 100}%` }} onChange={event => modify({ label: event.target.value }, naming.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); setNamingId(''); } }} onBlur={() => setNamingId('')} />}
      </div>
      <p>Drag a symbol here, or choose a tool and click the map.</p>
    </div>
    <div className="dz-map-inspector"><strong>{current ? `Selected ${labelOf(current.kind)}` : 'Map layers'}</strong>
      {current ? <>
        <Field name="Name or letter" value={current.label || ''} onChange={label => modify({ label })} />
        {current.kind === 'icon' && <label className="dz-field"><span>Symbol</span><select value={current.icon} onChange={event => modify({ icon: event.target.value })}>{MAP_ICONS.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}
        {!current.points && <details className="dz-map-advanced"><summary>Exact position and size</summary><NumberField name="Across (%)" value={Math.round((current.x ?? .5) * 100)} onChange={value => modify({ x: clamp((value ?? 50) / 100) })} /><NumberField name="Down (%)" value={Math.round((current.y ?? .5) * 100)} onChange={value => modify({ y: clamp((value ?? 50) / 100) })} />{resizableKinds.includes(current.kind) && <><NumberField name="Width (%)" value={Math.round((current.w ?? .1) * 100)} onChange={value => modify({ w: clamp((value ?? 10) / 100, .025, 1) })} /><NumberField name="Height (%)" value={Math.round((current.h ?? .1) * 100)} onChange={value => modify({ h: clamp((value ?? 10) / 100, .025, 1) })} /><NumberField name="Rotation (°)" value={Math.round(current.rotation ?? 0)} onChange={value => modify({ rotation: value ?? 0 })} /></>}</details>}
        {['building','room','zone'].includes(current.kind) && <label className="dz-field"><span>Fill colour</span><input type="color" value={current.fill || '#ffffff'} onChange={event => modify({ fill: event.target.value })} /></label>}
        <div className="dz-map-layer-actions"><button type="button" onClick={() => { setDraft(value => ({ ...value, items: value.items.filter(item => item.id !== selected) })); setSelected(''); }}>Delete</button><button type="button" onClick={() => { const copy = { ...current, id: crypto.randomUUID(), x: clamp((current.x ?? .5) + .04), y: clamp((current.y ?? .5) + .04), points: current.points?.map(point => ({ x: clamp(point.x + .04), y: clamp(point.y + .04) })) }; setDraft(value => ({ ...value, items: [...value.items, copy] })); setSelected(copy.id); }}>Duplicate</button></div>
      </> : <p>Choose an object on the map or from the list below.</p>}
      <div className="dz-map-layers">{draft.items.map(item => <button type="button" key={item.id} className={selected === item.id ? 'on' : ''} onClick={() => { setSelected(item.id); chooseTool('select'); }}>{item.label || labelOf(item.kind)}</button>)}</div>
    </div></div>
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={save}>Save map</button></footer>
  </div></div>;
}

import { useRef, useState } from 'react';
import type { MapItem, MapItemKind } from './figures';
import { arrangeMapItems, type MapArrangement } from './mapLayout';
import { MapSymbolIcon } from './MapSymbolLibrary';
import './mapLayers.css';

type LayersProps = {
  items: MapItem[];
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  onChangeItems: (items: MapItem[]) => void;
};

const kindNames: Partial<Record<MapItemKind, string>> = {
  road: 'Road', river: 'River', footpath: 'Footpath', wall: 'Wall', fence: 'Fence',
  zone: 'Area', building: 'Building', room: 'Room', water: 'Water', roundabout: 'Roundabout',
  tree: 'Tree', gate: 'Gate', bridge: 'Bridge', compass: 'North arrow', icon: 'Symbol',
  marker: 'Letter marker', label: 'Text label',
};
const arrangementButtons: { action: MapArrangement; text: string; needs: number }[] = [
  { action: 'align-left', text: 'Left', needs: 2 },
  { action: 'align-centre', text: 'Centre', needs: 2 },
  { action: 'align-right', text: 'Right', needs: 2 },
  { action: 'align-top', text: 'Top', needs: 2 },
  { action: 'align-middle', text: 'Middle', needs: 2 },
  { action: 'align-bottom', text: 'Bottom', needs: 2 },
  { action: 'space-across', text: 'Across', needs: 3 },
  { action: 'space-down', text: 'Down', needs: 3 },
];

function LayerPicture({ item }: { item: MapItem }) {
  const route = ['road', 'river', 'footpath', 'wall', 'fence', 'bridge'].includes(item.kind);
  if (item.kind === 'icon' || item.kind === 'tree' || item.kind === 'compass' || item.kind === 'gate') {
    const key = item.kind === 'icon' ? item.icon || 'notice' : item.kind === 'compass' ? 'north' : item.kind;
    return <span className="dz-layer-picture"><MapSymbolIcon symbolKey={key} size={26} /></span>;
  }
  if (item.kind === 'marker') return <span className="dz-layer-picture dz-layer-marker" aria-hidden="true">{item.label || 'A'}</span>;
  if (item.kind === 'label') return <span className="dz-layer-picture dz-layer-text" aria-hidden="true">T</span>;
  if (route) return <span className="dz-layer-picture" aria-hidden="true"><svg viewBox="0 0 32 32" width="27" height="27"><path d="M3 24 11 11 19 17 29 6" fill="none" stroke="currentColor" strokeWidth={item.kind === 'road' ? 5 : 3} strokeDasharray={item.kind === 'footpath' || item.kind === 'fence' ? '4 3' : undefined} strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
  return <span className={`dz-layer-picture dz-layer-shape dz-layer-${item.kind}`} aria-hidden="true"><span /></span>;
}

function ActionIcon({ name }: { name: 'show' | 'hide' | 'lock' | 'unlock' | 'up' | 'down' }) {
  if (name === 'up' || name === 'down') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d={name === 'up' ? 'M10 16V4m0 0L5 9m5-5 5 5' : 'M10 4v12m0 0-5-5m5 5 5-5'} /></svg>;
  if (name === 'lock' || name === 'unlock') return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="2" /><path d={name === 'lock' ? 'M6.5 9V6a3.5 3.5 0 0 1 7 0v3' : 'M6.5 9V6a3.5 3.5 0 0 1 7 0'} /></svg>;
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" /><circle cx="10" cy="10" r="2" />{name === 'hide' && <path d="M3 17 17 3" />}</svg>;
}

const labelFor = (item: MapItem) => item.label?.trim() || (item.kind === 'icon' && item.icon ? item.icon : kindNames[item.kind]) || 'Map object';

export function MapLayersPanel({ items, selectedIds, onSelectIds, onChangeItems }: LayersProps) {
  const [message, setMessage] = useState('');
  const lastIndex = useRef<number | null>(null);
  const selectable = items.filter(item => !item.locked && !item.hidden);
  const selected = new Set(selectedIds);
  const unlockedCount = items.filter(item => selected.has(item.id) && !item.locked).length;
  const ordered = [...items].reverse();
  const setOne = (id: string, patch: Partial<MapItem>) => onChangeItems(items.map(item => item.id === id ? { ...item, ...patch } : item));
  const moveLayer = (id: string, direction: 1 | -1) => {
    const index = items.findIndex(item => item.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= items.length) return;
    const copy = [...items];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    onChangeItems(copy);
    setMessage(`${labelFor(items[index])} moved ${direction === 1 ? 'forward' : 'backward'}.`);
  };
  const selectRow = (id: string, rowIndex: number, additive: boolean, range: boolean) => {
    if (ordered[rowIndex]?.locked || ordered[rowIndex]?.hidden) return;
    if (range && lastIndex.current !== null) {
      const first = Math.min(lastIndex.current, rowIndex), last = Math.max(lastIndex.current, rowIndex);
      const ids = ordered.slice(first, last + 1).filter(item => !item.locked).map(item => item.id);
      onSelectIds([...new Set([...selectedIds, ...ids])]);
    } else if (additive) {
      onSelectIds(selected.has(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id]);
    } else onSelectIds([id]);
    lastIndex.current = rowIndex;
  };
  const group = () => {
    if (unlockedCount < 2) return;
    const groupId = crypto.randomUUID();
    onChangeItems(items.map(item => selected.has(item.id) && !item.locked ? { ...item, groupId } : item));
    setMessage(`${unlockedCount} layers grouped. Drag one to move them together.`);
  };
  const ungroup = () => {
    const groups = new Set(items.filter(item => selected.has(item.id) && item.groupId).map(item => item.groupId));
    if (!groups.size) return;
    onChangeItems(items.map(item => item.groupId && groups.has(item.groupId) ? { ...item, groupId: undefined } : item));
    setMessage('Layers ungrouped.');
  };
  const arrange = (action: MapArrangement) => {
    if (unlockedCount < (action.startsWith('space-') ? 3 : 2)) return;
    onChangeItems(arrangeMapItems(items, selectedIds, action));
    setMessage(`${unlockedCount} layers arranged ${arrangementButtons.find(value => value.action === action)?.text.toLowerCase()}.`);
  };

  return <section className="dz-map-layer-panel" aria-label="Map layers">
    <div className="dz-layer-heading"><div><strong>Layers</strong><span>{items.length}</span></div><p>The top layer sits in front on the map.</p></div>
    {items.length ? <>
      <div className="dz-layer-list" role="group" aria-label="Map object layers">
        {ordered.map((item, rowIndex) => <div className={`dz-layer-row${selected.has(item.id) ? ' is-selected' : ''}${item.hidden ? ' is-hidden' : ''}`} key={item.id}>
          <label className="dz-layer-check"><input type="checkbox" checked={selected.has(item.id)} disabled={item.locked || item.hidden} onChange={() => selectRow(item.id, rowIndex, true, false)} aria-label={`Select ${labelFor(item)}`} /></label>
          <button type="button" className="dz-layer-main" disabled={item.locked || item.hidden} onClick={event => selectRow(item.id, rowIndex, event.metaKey || event.ctrlKey, event.shiftKey)} aria-pressed={selected.has(item.id)} title={labelFor(item)}>
            <LayerPicture item={item} /><span className="dz-layer-words"><span className="dz-layer-name">{labelFor(item)}</span><small>{item.groupId ? 'Grouped · ' : ''}{item.locked ? 'Locked · ' : ''}{kindNames[item.kind]}</small></span>
          </button>
          <div className="dz-layer-actions">
            <button type="button" onClick={() => setOne(item.id, { hidden: !item.hidden })} aria-label={`${item.hidden ? 'Show' : 'Hide'} ${labelFor(item)}`} title={item.hidden ? 'Show layer' : 'Hide layer'}><ActionIcon name={item.hidden ? 'show' : 'hide'} /></button>
            <button type="button" onClick={() => setOne(item.id, { locked: !item.locked })} aria-label={`${item.locked ? 'Unlock' : 'Lock'} ${labelFor(item)}`} title={item.locked ? 'Unlock layer' : 'Lock layer'}><ActionIcon name={item.locked ? 'unlock' : 'lock'} /></button>
            <button type="button" onClick={() => moveLayer(item.id, 1)} disabled={rowIndex === 0} aria-label={`Move ${labelFor(item)} forward`} title="Move forward"><ActionIcon name="up" /></button>
            <button type="button" onClick={() => moveLayer(item.id, -1)} disabled={rowIndex === ordered.length - 1} aria-label={`Move ${labelFor(item)} backward`} title="Move backward"><ActionIcon name="down" /></button>
          </div>
        </div>)}
      </div>
      <div className="dz-layer-select-actions"><button type="button" onClick={() => onSelectIds(selectable.map(item => item.id))} disabled={!selectable.length}>Select all</button><button type="button" onClick={() => onSelectIds([])} disabled={!selectedIds.length}>Clear selection</button></div>
      <div className="dz-layer-group-actions"><button type="button" onClick={group} disabled={unlockedCount < 2}>Group selected</button><button type="button" onClick={ungroup} disabled={!items.some(item => selected.has(item.id) && item.groupId)}>Ungroup</button></div>
      <div className="dz-layer-arrange"><strong>Line up selected layers</strong><div>{arrangementButtons.map(({ action, text, needs }) => <button type="button" key={action} onClick={() => arrange(action)} disabled={unlockedCount < needs} title={action.startsWith('space-') ? 'Select at least three unlocked layers' : 'Select at least two unlocked layers'}>{text}</button>)}</div><small>Select two layers to align them, or three to space them evenly.</small></div>
    </> : <p className="dz-layer-empty">Your map objects will appear here as you add them.</p>}
    <span className="dz-layer-announcement" role="status">{message}</span>
  </section>;
}

export function MapMarkerKey({ items, onChangeItems }: { items: MapItem[]; onChangeItems: (items: MapItem[]) => void }) {
  const markers = items.filter(item => item.kind === 'marker');
  const labelInOrder = () => {
    let index = 0;
    onChangeItems(items.map(item => item.kind === 'marker' ? { ...item, label: letterForIndex(index++) } : item));
  };
  return <section className="dz-map-marker-key" aria-label="Map letter key"><div className="dz-marker-heading"><strong>Letter key</strong><button type="button" onClick={labelInOrder} disabled={!markers.length}>Label A–Z in order</button></div>
    {markers.length ? <><p>Use these letters in a Classes label-the-picture task. Put correct answers in that task’s answer key.</p><div className="dz-marker-key-list">{markers.map(item => <div key={item.id} aria-label={`Map marker ${item.label || 'unlabelled'}`}><span>{item.label || '·'}</span><small>Map marker</small></div>)}</div></> : <p>Add a letter marker to the map to make a key.</p>}
  </section>;
}

function letterForIndex(index: number): string {
  let value = index + 1, label = '';
  while (value > 0) { value -= 1; label = String.fromCharCode(65 + value % 26) + label; value = Math.floor(value / 26); }
  return label;
}

export function MapHistoryToolbar({ canUndo, canRedo, onUndo, onRedo }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) {
  return <div className="dz-map-history" role="group" aria-label="Undo and redo map changes"><button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo map change" title="Undo map change">↶ <span>Undo</span></button><button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo map change" title="Redo map change">↷ <span>Redo</span></button></div>;
}

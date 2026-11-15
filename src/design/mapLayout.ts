import type { MapItem } from './figures';

export type MapArrangement =
  | 'align-left' | 'align-centre' | 'align-right'
  | 'align-top' | 'align-middle' | 'align-bottom'
  | 'space-across' | 'space-down';

type Bounds = { left: number; right: number; top: number; bottom: number };
const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(upper, value));

export function mapItemBounds(item: MapItem): Bounds {
  if (item.points?.length) {
    const xs = item.points.map(point => point.x);
    const ys = item.points.map(point => point.y);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  }
  const width = item.w ?? (item.kind === 'marker' || item.kind === 'icon' ? .06 : .04);
  const height = item.h ?? (item.kind === 'marker' || item.kind === 'icon' ? .06 : .04);
  const x = item.x ?? .5, y = item.y ?? .5;
  return { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 };
}

function move(item: MapItem, dx: number, dy: number): MapItem {
  const bounds = mapItemBounds(item);
  dx = clamp(dx, -bounds.left, 1 - bounds.right);
  dy = clamp(dy, -bounds.top, 1 - bounds.bottom);
  if (item.points?.length) return {
    ...item,
    points: item.points.map(point => ({ x: point.x + dx, y: point.y + dy })),
  };
  return { ...item, x: (item.x ?? .5) + dx, y: (item.y ?? .5) + dy };
}

function coordinate(bounds: Bounds, axis: 'x' | 'y', edge: 'min' | 'centre' | 'max') {
  const min = axis === 'x' ? bounds.left : bounds.top;
  const max = axis === 'x' ? bounds.right : bounds.bottom;
  return edge === 'min' ? min : edge === 'max' ? max : (min + max) / 2;
}

/** Arrange only the named objects. Others retain their positions and order. */
export function arrangeMapItems(items: MapItem[], selectedIds: string[], action: MapArrangement): MapItem[] {
  const selected = new Set(selectedIds);
  const picked = items.filter(item => selected.has(item.id) && !(item as MapItem & { locked?: boolean }).locked);
  const spacing = action === 'space-across' || action === 'space-down';
  if (picked.length < (spacing ? 3 : 2)) return items;

  const axis: 'x' | 'y' = action === 'space-across' || action.startsWith('align-l') || action.startsWith('align-c') || action.startsWith('align-r') ? 'x' : 'y';
  const replacements = new Map<string, MapItem>();

  if (spacing) {
    const sorted = [...picked].sort((a, b) => coordinate(mapItemBounds(a), axis, 'min') - coordinate(mapItemBounds(b), axis, 'min'));
    const first = mapItemBounds(sorted[0]);
    const last = mapItemBounds(sorted[sorted.length - 1]);
    const middleWidth = sorted.slice(1, -1).reduce((total, item) => {
      const b = mapItemBounds(item);
      return total + coordinate(b, axis, 'max') - coordinate(b, axis, 'min');
    }, 0);
    const gap = (coordinate(last, axis, 'min') - coordinate(first, axis, 'max') - middleWidth) / (sorted.length - 1);
    let next = coordinate(first, axis, 'max') + gap;
    for (const item of sorted.slice(1, -1)) {
      const bounds = mapItemBounds(item);
      const delta = next - coordinate(bounds, axis, 'min');
      replacements.set(item.id, move(item, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0));
      next += coordinate(bounds, axis, 'max') - coordinate(bounds, axis, 'min') + gap;
    }
  } else {
    const edge = action.endsWith('left') || action.endsWith('top') ? 'min'
      : action.endsWith('right') || action.endsWith('bottom') ? 'max' : 'centre';
    const all = picked.map(mapItemBounds);
    const union: Bounds = {
      left: Math.min(...all.map(b => b.left)), right: Math.max(...all.map(b => b.right)),
      top: Math.min(...all.map(b => b.top)), bottom: Math.max(...all.map(b => b.bottom)),
    };
    const target = coordinate(union, axis, edge);
    for (const item of picked) {
      const delta = target - coordinate(mapItemBounds(item), axis, edge);
      replacements.set(item.id, move(item, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0));
    }
  }
  return items.map(item => replacements.get(item.id) ?? item);
}

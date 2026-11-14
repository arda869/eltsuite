import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeMapItems, mapItemBounds } from '../src/design/mapLayout.ts';

const icon = (id, x, y = .5, w = .1, h = .1) => ({ id, kind: 'icon', icon: 'tree', x, y, w, h });
const left = item => mapItemBounds(item).left;
const right = item => mapItemBounds(item).right;

test('alignment moves selected objects while preserving unrelated and locked objects', () => {
  const original = [icon('a', .2), icon('b', .6), icon('c', .8), { ...icon('locked', .9), locked: true }];
  const arranged = arrangeMapItems(original, ['a', 'b', 'locked'], 'align-left');
  assert.ok(Math.abs(left(arranged[0]) - left(arranged[1])) < 1e-9);
  assert.deepEqual(arranged[2], original[2]);
  assert.deepEqual(arranged[3], original[3]);
  assert.equal(arranged.map(item => item.id).join(','), original.map(item => item.id).join(','));
});

test('spacing uses equal visible gaps between objects of different sizes', () => {
  const arranged = arrangeMapItems([
    icon('a', .15, .5, .1), icon('b', .47, .5, .18), icon('c', .8, .5, .08),
  ], ['a', 'b', 'c'], 'space-across');
  const gap1 = left(arranged[1]) - right(arranged[0]);
  const gap2 = left(arranged[2]) - right(arranged[1]);
  assert.ok(Math.abs(gap1 - gap2) < 1e-9);
});

test('routes move by shifting every path point together', () => {
  const route = { id: 'route', kind: 'footpath', points: [{ x: .2, y: .2 }, { x: .4, y: .3 }] };
  const target = icon('target', .7, .6);
  const [moved] = arrangeMapItems([route, target], ['route', 'target'], 'align-middle');
  const firstDelta = moved.points[0].y - route.points[0].y;
  const secondDelta = moved.points[1].y - route.points[1].y;
  assert.ok(Math.abs(firstDelta - secondDelta) < 1e-9);
});

test('one selected object is unchanged', () => {
  const original = [icon('a', .2), icon('b', .7)];
  assert.strictEqual(arrangeMapItems(original, ['a'], 'align-top'), original);
});

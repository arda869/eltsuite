import assert from 'node:assert/strict';
import test from 'node:test';
import { definedFields } from '../src/lib/definedFields.ts';

test('version assignment omits an unselected group set before saving', () => {
  const dist = definedFields({ mode: 'choose', sameId: 'task-a', groupSetId: undefined, roleMap: ['task-a', 'task-b'] });
  assert.deepEqual(dist, { mode: 'choose', sameId: 'task-a', roleMap: ['task-a', 'task-b'] });
  assert.equal(JSON.stringify(dist).includes('groupSetId'), false);
});

test('selected group sets are retained for room assignment', () => {
  assert.deepEqual(definedFields({ mode: 'room', groupSetId: 'rooms-1' }), { mode: 'room', groupSetId: 'rooms-1' });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueForPurge, purgeFileBin, BIN_RETENTION_MS } from '../scripts/file-bin-cleanup.mjs';
const now = 1800000000000;
test('retention never deletes active files; expires at 30 days or explicit request', () => {
  assert.equal(dueForPurge({}, now), false);
  assert.equal(dueForPurge({ purgeRequestedAt: now }, now), false);
  assert.equal(dueForPurge({ deletedAt: now - BIN_RETENTION_MS + 1 }, now), false);
  assert.equal(dueForPurge({ deletedAt: now - BIN_RETENTION_MS }, now), true);
  assert.equal(dueForPurge({ deletedAt: now, purgeRequestedAt: now }, now), true);
  assert.equal(dueForPurge({ deletedAt: 'old', purgeRequestedAt: now }, now), false);
});
function fake(data) {
  const events = [];
  const ref = { path: 'sharedDocs/one' };
  const row = { ref, data: () => data };
  const db = {
    runTransaction: async (fn) => fn({ get: async () => ({ exists: true, data: () => data }), update: (_r, p) => { events.push('claim'); Object.assign(data, p); } }),
    collection: (name) => ({ where: () => ({ get: async () => ({ docs: name === 'sharedDocs' ? [row] : [] }) }), select: () => ({ get: async () => ({ docs: [] }) }) }),
    recursiveDelete: async () => events.push('firestore'),
  };
  const rtdb = { ref: () => ({ remove: async () => events.push('rtdb') }) };
  return { db, rtdb, events };
}
test('cleanup removes RTDB and recursive payloads after claiming; second run skips restored files', async () => {
  const f = fake({ deletedAt: now - BIN_RETENTION_MS, docKey: 'example' });
  assert.equal(await purgeFileBin(f.db, f.rtdb, now), 1);
  assert.deepEqual(f.events, ['claim', 'rtdb', 'firestore']);
  const restored = fake({ docKey: 'example' });
  assert.equal(await purgeFileBin(restored.db, restored.rtdb, now), 0);
  assert.deepEqual(restored.events, []);
});
test('payload deletion failure preserves metadata for a later retry', async () => {
  const f = fake({ deletedAt: now - BIN_RETENTION_MS, docKey: 'example' });
  f.rtdb.ref = () => ({ remove: async () => { throw new Error('connection lost'); } });
  await assert.rejects(purgeFileBin(f.db, f.rtdb, now), /connection lost/);
  assert.deepEqual(f.events, ['claim']);
});

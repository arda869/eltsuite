import assert from 'node:assert/strict';
import { inlineDocumentAccess, sharedDocumentAccess, syncInlineDocumentAccess } from '../functions/collab/access.js';

const members = [
  { id: 'learnerA', get: field => field === 'learnerId' ? 'A' : null },
  { id: 'learnerB', get: field => field === 'learnerId' ? 'B' : null },
  { id: 'learnerC', get: field => field === 'learnerId' ? 'C' : null },
];
const group = { id: 'first', get: field => field === 'groups' ? [{ id: 'g1', members: ['A', 'B'] }, { id: 'g2', members: ['C'] }] : null };
const cls = { exists: true, data: () => ({ teacherId: 'teacher', coTeachers: { helper: { role: 'co' }, observer: { role: 'viewer' } } }), ref: { collection: name => ({ get: async () => ({ docs: name === 'members' ? members : [group] }), orderBy: () => ({ get: async () => ({ docs: [group] }) }) }) } };
let registry = { scope: 'solo', modes: ['edit', 'comment'], groupSet: 'first' };
const db = {
  doc(path) {
    if (path === 'classes/c1') return { get: async () => cls };
    if (path === 'classes/c1/collabs/base') return { get: async () => ({ exists: true, data: () => registry }) };
    return { get: async () => ({ exists: false }) };
  },
  collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: true }) }) }) }),
};
const solo = await inlineDocumentAccess(db, 'c1', { ...registry, docKey: 'base' });
assert.equal(solo['base~lA'].read.learnerA, true);
assert.equal(solo['base~lA'].read.learnerB, undefined);
assert.equal(solo['base~lA'].peer.learnerB, true);
assert.equal(solo['base~lA'].peer.learnerC, undefined);
assert.equal(solo['base~lA'].edit.teacher, true);
assert.equal(solo['base~t'].read.learnerA, undefined);
registry = { ...registry, scope: 'group', modes: ['comment'] };
const grouped = await inlineDocumentAccess(db, 'c1', { ...registry, docKey: 'base' });
assert.equal(grouped['base~gg1'].read.learnerA, true);
assert.equal(grouped['base~gg1'].read.learnerB, true);
assert.equal(grouped['base~gg1'].read.learnerC, undefined);
assert.equal(grouped['base~gg1'].edit.learnerA, undefined);
assert.equal(grouped['base~gg1'].comment.learnerA, true);
const shared = await sharedDocumentAccess(db, { owner: 'teacher', members: { editor: { role: 'edit' }, commenter: { role: 'comment' }, viewer: { role: 'view' } }, classes: { c1: { role: 'view' } } });
assert.equal(shared.edit.editor, true);
assert.equal(shared.edit.commenter, undefined);
assert.equal(shared.comment.commenter, true);
assert.equal(shared.read.viewer, true);
assert.equal(shared.edit.viewer, undefined);
assert.equal(shared.read.learnerA, true);
assert.equal(shared.edit.learnerA, undefined);
assert.deepEqual(await sharedDocumentAccess(db, { owner: 'teacher', deletedAt: 1 }), { read: {}, edit: {}, comment: {}, peer: {}, flags: {} });
const data = new Map();
const realtime = { ref: path => ({ get: async () => ({ val: () => data.get(path) }), transaction: async fn => { const next = fn(data.get(path)); if (next === undefined) return { committed: false }; data.set(path, next); return { committed: true }; } }) };
await syncInlineDocumentAccess(db, realtime, 'c1', 'base');
assert.equal(data.get('collabAccess/base~gg1').read.learnerA, true);
registry = { ...registry, scope: 'class' };
await syncInlineDocumentAccess(db, realtime, 'c1', 'base');
assert.deepEqual(data.get('collabAccess/base~gg1').read, {});
assert.equal(data.get('collabAccess/base').read.learnerC, true);
const latest = Date.now() + 5000;
registry = { ...registry, scope: 'group' };
await syncInlineDocumentAccess(db, realtime, 'c1', 'base', latest);
registry = { ...registry, scope: 'class' };
await syncInlineDocumentAccess(db, realtime, 'c1', 'base', latest + 1);
registry = { ...registry, scope: 'group' };
await syncInlineDocumentAccess(db, realtime, 'c1', 'base', latest);
assert.deepEqual(data.get('collabAccess/base~gg1').read, {}, 'an older event cannot restore revoked access');
const raceData = new Map();
let resumeOld;
let oldReached;
const oldPaused = new Promise(resolve => { oldReached = resolve; });
const continueOld = new Promise(resolve => { resumeOld = resolve; });
let pauseGroupGrant = true;
const raceRealtime = { ref: path => ({
  transaction: async fn => {
    if (path === 'collabAccess/base~gg1' && pauseGroupGrant) {
      pauseGroupGrant = false;
      oldReached();
      await continueOld;
    }
    const next = fn(raceData.get(path));
    if (next === undefined) return { committed: false };
    raceData.set(path, next);
    return { committed: true };
  },
}) };
registry = { ...registry, scope: 'group' };
const first = syncInlineDocumentAccess(db, raceRealtime, 'c1', 'base', latest + 10);
await oldPaused;
registry = { ...registry, scope: 'class' };
await syncInlineDocumentAccess(db, raceRealtime, 'c1', 'base', latest + 11);
resumeOld();
await first;
assert.deepEqual(raceData.get('collabAccess/base~gg1').read, {}, 'a delayed group grant cannot outlive a newer revision');
console.log('Shared and class document access grants and revoked derived keys passed.');

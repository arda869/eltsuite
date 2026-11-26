import test from 'node:test';
import assert from 'node:assert/strict';
import { suiteScriptReferenceService } from '../suitescript/references.js';
import { suiteScriptId } from '../suitescript/id.js';

function memoryDb(seed) {
  const records = new Map(Object.entries(seed));
  const doc = path => ({
    path,
    get: async () => snapshot(records.get(path)),
  });
  const db = {
    doc,
    runTransaction: async callback => callback({
      get: ref => ref.get(),
      create: (ref, data) => { if (records.has(ref.path)) throw Error('collision'); records.set(ref.path, data); },
      update: (ref, data) => records.set(ref.path, { ...records.get(ref.path), ...data }),
    }),
  };
  return { db, records };
}
function snapshot(data) { return { exists: !!data, data: () => data, get: key => data?.[key] }; }

test('stable IDs survive rename/move, and source and destination permissions are checked', async () => {
  const { db, records } = memoryDb({
    'users/teacher/archive/audio1': { kind: 'audio', home: { classId: 'class1', mediaId: 'm1' }, title: 'Original' },
    'sharedDocs/doc1': { kind: 'doc', owner: 'teacher', memberIds: ['learner'], classes: { class1: { role: 'view', name: 'Example class' } }, docKey: 'doc-key' },
    'classes/class1': { teacherId: 'teacher' },
    'classes/foreign': { teacherId: 'other' },
  });
  const audio = await suiteScriptReferenceService(db, 'teacher', { action: 'ensure', kind: 'archive', id: 'audio1' });
  const shared = await suiteScriptReferenceService(db, 'teacher', { action: 'ensure', kind: 'sharedDoc', id: 'doc1' });
  assert.match(audio.id, /^ELTSUITE-(\d{4}-){3}\d{4}$/);
  records.set('users/teacher/archive/audio1', { ...records.get('users/teacher/archive/audio1'), title: 'Moved and renamed', folderId: 'new' });
  assert.equal((await suiteScriptReferenceService(db, 'teacher', { action: 'ensure', kind: 'archive', id: 'audio1' })).id, audio.id);
  assert.equal((await suiteScriptReferenceService(db, 'teacher', { action: 'resolve', id: audio.id, destination: { mode: 'class', classId: 'class1' } })).sourceId, 'audio1');
  const sharedInClass = await suiteScriptReferenceService(db, 'teacher', { action: 'resolve', id: shared.id, destination: { mode: 'class', classId: 'class1' } });
  assert.equal(sharedInClass.docKey, 'doc-key');
  assert.equal(sharedInClass.classRole, 'view');
  await assert.rejects(suiteScriptReferenceService(db, 'other', { action: 'resolve', id: audio.id, destination: { mode: 'private' } }), e => e.code === 'permission-denied');
  await assert.rejects(suiteScriptReferenceService(db, 'teacher', { action: 'resolve', id: audio.id, destination: { mode: 'class', classId: 'foreign' } }), e => e.code === 'permission-denied');
  await assert.rejects(suiteScriptReferenceService(db, 'teacher', { action: 'resolve', id: audio.id, destination: { mode: 'message', recipientIds: ['learner'] } }), e => e.code === 'permission-denied');
  await assert.rejects(suiteScriptReferenceService(db, 'teacher', { action: 'resolve', id: audio.id, destination: { mode: 'resourceHub' } }), e => e.code === 'permission-denied');
  assert.equal((await suiteScriptReferenceService(db, 'teacher', { action: 'resolve', id: shared.id, destination: { mode: 'message', recipientIds: ['learner'] } })).sourceId, 'doc1');
  await assert.rejects(suiteScriptReferenceService(db, 'teacher', { action: 'resolve', id: shared.id, destination: { mode: 'message', recipientIds: ['stranger'] } }), e => e.code === 'permission-denied');
  const swapped = audio.id.slice(0, 9) + audio.id[10] + audio.id[9] + audio.id.slice(11);
  await assert.rejects(suiteScriptReferenceService(db, 'teacher', { action: 'resolve', id: swapped, destination: { mode: 'private' } }), e => e.code === 'invalid-argument');
  records.delete('users/teacher/archive/audio1');
  await assert.rejects(suiteScriptReferenceService(db, 'teacher', { action: 'resolve', id: audio.id, destination: { mode: 'private' } }), e => e.code === 'not-found');
});

test('ensure rejects a forged or orphaned existing reference', async () => {
  const { db, records } = memoryDb({ 'users/teacher/archive/audio1': { kind: 'audio', suiteScriptRef: 'ELTSUITE-0001-0002-0003-0000' } });
  await assert.rejects(suiteScriptReferenceService(db, 'teacher', { action: 'ensure', kind: 'archive', id: 'audio1' }), e => e.code === 'failed-precondition');
  records.set('users/teacher/archive/audio1', { kind: 'audio', suiteScriptRef: suiteScriptId('000100020003') });
  await assert.rejects(suiteScriptReferenceService(db, 'teacher', { action: 'ensure', kind: 'archive', id: 'audio1' }), e => e.code === 'failed-precondition');
});

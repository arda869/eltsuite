import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteLearnerIdentityForClass } from './delete.js';

function fixture({ teacher = 'teacher', coTeachers = {}, profile = { role: 'learner', classId: 'class', learnerId: 'learner' }, learner = { authUid: 'learner-uid' } } = {}) {
  const docs = new Map([
    ['classes/class', { teacherId: teacher, coTeachers }],
    ...(learner ? [['classes/class/learners/learner', learner]] : []),
    ...(profile ? [['users/learner-uid', profile]] : []),
  ]);
  const db = { doc: path => ({ get: async () => {
    const data = docs.get(path);
    return { exists: !!data, data: () => data, get: field => data?.[field] };
  } }) };
  const deleted = [];
  const identities = { deleteUser: async uid => { deleted.push(uid); } };
  return { db, identities, deleted, request: { uid: 'teacher', token: {} }, data: { classId: 'class', learnerId: 'learner' } };
}

test('class teacher can delete the matching learner identity', async () => {
  const f = fixture();
  assert.deepEqual(await deleteLearnerIdentityForClass(f.db, f.identities, f.request, f.data), { deleted: true });
  assert.deepEqual(f.deleted, ['learner-uid']);
});

test('a co-teacher can remove a learner in their class', async () => {
  const f = fixture({ teacher: 'other', coTeachers: { teacher: { role: 'co' } } });
  assert.deepEqual(await deleteLearnerIdentityForClass(f.db, f.identities, f.request, f.data), { deleted: true });
  assert.deepEqual(f.deleted, ['learner-uid']);
});

test('a missing learner is safe to retry', async () => {
  const f = fixture({ learner: null });
  assert.deepEqual(await deleteLearnerIdentityForClass(f.db, f.identities, f.request, f.data), { deleted: true });
  assert.deepEqual(f.deleted, []);
});

test('missing identity is safe to retry after a partial removal', async () => {
  const f = fixture();
  f.identities.deleteUser = async () => { throw Object.assign(Error('missing'), { code: 'auth/user-not-found' }); };
  assert.deepEqual(await deleteLearnerIdentityForClass(f.db, f.identities, f.request, f.data), { deleted: true });
});

test('viewer and unrelated teacher cannot remove a learner', async () => {
  const f = fixture({ teacher: 'other', coTeachers: { teacher: { role: 'viewer' } } });
  await assert.rejects(() => deleteLearnerIdentityForClass(f.db, f.identities, f.request, f.data), { code: 'permission-denied' });
  assert.equal(f.deleted.length, 0);
});

test('a mismatched account profile cannot be deleted', async () => {
  const f = fixture({ profile: { role: 'teacher', classId: 'class', learnerId: 'learner' } });
  await assert.rejects(() => deleteLearnerIdentityForClass(f.db, f.identities, f.request, f.data), { code: 'failed-precondition' });
  assert.equal(f.deleted.length, 0);
});

test('a real authentication deletion failure stops the database cleanup', async () => {
  const f = fixture();
  f.identities.deleteUser = async () => { throw Error('service unavailable'); };
  await assert.rejects(() => deleteLearnerIdentityForClass(f.db, f.identities, f.request, f.data), /service unavailable/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { learnerDiscussionTimelineFor } from '../learning/discussion-timeline.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run against the Firestore emulator');
const db = getFirestore(initializeApp({ projectId: 'demo-learning-timeline' }));
const prefix = `classes/timeline-${Date.now()}`;
const classId = prefix.split('/')[1];

test('learner discussion timeline queries the selected learner and class with teacher access', async () => {
  await Promise.all([
    db.doc(`${prefix}`).set({ teacherId: 'teacher', coTeachers: { viewer: { role: 'viewer' } } }),
    db.doc(`${prefix}/learners/L1`).set({ authUid: 'uid1', displayName: 'Learner One' }),
    db.doc(`${prefix}/learners/L2`).set({ authUid: 'uid2', displayName: 'Learner Two' }),
    db.doc(`${prefix}/threads/own`).set({ learnerId: 'L1', title: 'Own thread', at: 100 }),
    db.doc(`${prefix}/threads/other`).set({ learnerId: 'L2', title: 'Other thread', at: 200 }),
    db.doc(`${prefix}/threads/other/posts/reply`).set({ learnerId: 'L1', by: 'uid1', at: 300 }),
    db.doc(`${prefix}/threads/other/posts/otherReply`).set({ learnerId: 'L2', by: 'uid2', at: 400 }),
    db.doc(`classes/foreign-${Date.now()}/threads/elsewhere/posts/reply`).set({ learnerId: 'L1', by: 'uid1', at: 500 }),
  ]);
  const data = { classId, learnerId: 'L1', learnerUid: 'uid1' };
  const result = await learnerDiscussionTimelineFor(db, { uid: 'teacher' }, data);
  assert.deepEqual(result.entries.map(entry => [entry.kind, entry.where, entry.at]).sort(), [
    ['post', 'Own thread', 100],
    ['reply', 'Other thread', 300],
  ].sort());
  const viewed = await learnerDiscussionTimelineFor(db, { uid: 'viewer' }, data);
  assert.deepEqual(viewed, result);
  await assert.rejects(learnerDiscussionTimelineFor(db, { uid: 'stranger' }, data), error => error.code === 'permission-denied');
  await assert.rejects(learnerDiscussionTimelineFor(db, { uid: 'teacher', token: { proxyBy: 'owner' } }, data), error => error.code === 'permission-denied');
  await assert.rejects(learnerDiscussionTimelineFor(db, { uid: 'teacher' }, { ...data, learnerUid: 'uid2' }), error => error.code === 'not-found');
});

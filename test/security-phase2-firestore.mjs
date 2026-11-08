// Run only against a disposable Firestore emulator with this repository's rules.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, terminate, increment, serverTimestamp } from 'firebase/firestore';
import { assessTaskForLearner, runExamForLearner } from '../functions/learning/assessment.js';
import { checkSubTaskForLearner } from '../functions/learning/check-subtask.js';
import { syncClassAccess } from '../functions/learning/class-access.js';
import { resolveLearner } from '../functions/learning/join.js';
import { createInvitationRequest } from '../functions/accounts/invitations.js';
import { reserveCallRoom, finishCallRoom } from '../functions/learning/call-rooms.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('A disposable Firestore emulator is required.');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp: initializeAdmin } = require('firebase-admin/app');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const projectId = 'demo-phase2-security';
initializeAdmin({ projectId });
const admin = adminFirestore();
const clients = [];
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
function as(uid, learner = false) {
  const app = initializeApp({ projectId }, `phase2-${uid}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid, email: learner ? `${uid}@learners.lesson-lit.firebaseapp.com` : `${uid}@example.test` } });
  clients.push({ app, db });
  return db;
}
const denied = async (name, action) => {
  await assert.rejects(action, error => error.code === 'permission-denied', name);
  console.log('DENIED', name);
};
try {
  await admin.doc('users/teacher').set({ role: 'teacher', displayName: 'Teacher' });
  await admin.doc('users/learner').set({ role: 'learner', learnerId: 'one', classId: 'c1', displayName: 'One' });
  await admin.doc('users/other').set({ role: 'learner', learnerId: 'two', classId: 'c1', displayName: 'Two' });
  await admin.doc('users/viewer').set({ role: 'teacher', displayName: 'Viewer' });
  await admin.doc('classes/c1').set({ teacherId: 'teacher', coTeachers: { viewer: { role: 'viewer' } }, classCode: 'CLS-234', status: 'active' });
  await admin.doc('classCodes/CLS-234').set({ classId: 'c1', teacherId: 'teacher', className: 'Demo', roster: [{ id: 'one', name: 'One Learner' }] });
  assert.equal((await resolveLearner(admin, { code: 'CLS-234', name: ' One Learner ', address: 'test-a' })).learnerId, 'one');
  await assert.rejects(() => resolveLearner(admin, { code: 'CLS-234', name: 'Other Learner', address: 'test-a' }), { code: 'not-found' });
  const writes = [];
  const realtime = { ref: () => ({ update: patch => { writes.push(patch); return Promise.resolve(); } }) };
  await assert.rejects(() => syncClassAccess(admin, realtime, 'c1', 'other'), { code: 'permission-denied' });
  await syncClassAccess(admin, realtime, 'c1', 'teacher');
  assert.deepEqual(writes.at(-1), { 'classOwners/c1': 'teacher', 'classTeachers/c1': {} });
  await admin.doc('classes/c1/members/learner').set({ learnerId: 'one', displayName: 'One' });
  await admin.doc('classes/c1/members/other').set({ learnerId: 'two', displayName: 'Two' });
  await admin.doc('classes/c1/learners/one').set({ displayName: 'One', authUid: 'learner' });
  await admin.doc('classes/c1/learners/two').set({ displayName: 'Two', authUid: 'other' });
  await admin.doc('classes/c1/items/i1').set({ type: 'lesson', hidden: false, locked: false });
  await admin.doc('classes/c1/topics/shown').set({ name: 'Shown topic', order: 0, hidden: false });
  await admin.doc('classes/c1/topics/secret').set({ name: 'Hidden topic', order: 1, hidden: true });
  await admin.doc('classes/c1/items/iHidden').set({ type: 'lesson', hidden: true, locked: false,
    boardPages: [{ text: 'Unreleased teacher material' }] });
  await admin.doc('classes/c1/items/i1/tasks/t1').set({ kind: 'task', hidden: false, locked: false, content: { type: 'doc', content: [] } });
  const learner = as('learner', true), other = as('other', true), teacher = as('teacher'), viewer = as('viewer'), outsider = as('outsider');
  const shownTopics = await getDocs(query(collection(learner, 'classes/c1/topics'), where('hidden', '==', false)));
  assert.deepEqual(shownTopics.docs.map(d => d.id), ['shown']);
  await denied('learner cannot read hidden topic metadata', () => getDoc(doc(learner, 'classes/c1/topics/secret')));
  await denied('learner topic lists must filter hidden metadata', () => getDocs(collection(learner, 'classes/c1/topics')));
  await getDoc(doc(teacher, 'classes/c1/topics/secret'));
  const visibleItems = await getDocs(query(collection(learner, 'classes/c1/items'), where('hidden', '==', false)));
  assert.deepEqual(visibleItems.docs.map(d => d.id), ['i1']);
  await denied('learner cannot read a hidden lesson and its board pages', () => getDoc(doc(learner, 'classes/c1/items/iHidden')));
  await denied('learner item lists must filter hidden lessons', () => getDocs(collection(learner, 'classes/c1/items')));
  await getDoc(doc(teacher, 'classes/c1/items/iHidden'));
  const taskPath = 'classes/c1/items/i1/tasks/t1';
  const bodyPath = `${taskPath}/private/body`;
  await admin.doc('classes/c1/items/i1/tasks/tHidden').set({ kind: 'task', hidden: true, locked: false, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Not released' }] }] } });
  await admin.doc('classes/c1/items/i1/tasks/tLocked').set({ kind: 'task', hidden: false, locked: true, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Locked material' }] }] } });
  await admin.doc(taskPath).update({ allowed: ['one'] });
  await admin.doc(bodyPath).set({ content: { type: 'doc', content: [] } });
  const visible = await getDocs(query(collection(learner, 'classes/c1/items/i1/tasks'), where('hidden', '==', false), where('locked', '==', false)));
  assert.deepEqual(visible.docs.map(d => d.id), ['t1']);
  await denied('teacher-hidden task cannot be opened directly', () => getDoc(doc(learner, 'classes/c1/items/i1/tasks/tHidden')));
  await denied('teacher-locked task cannot be opened directly', () => getDoc(doc(learner, 'classes/c1/items/i1/tasks/tLocked')));
  await denied('learner task lists must include the visibility filter', () => getDocs(collection(learner, 'classes/c1/items/i1/tasks')));
  await denied('learner task lists must include the lock filter', () => getDocs(query(collection(learner, 'classes/c1/items/i1/tasks'), where('hidden', '==', false))));
  await admin.doc('classes/c1/items/i1/tasks/tLocked').update({ locked: false });
  const unlocked = await getDocs(query(collection(learner, 'classes/c1/items/i1/tasks'), where('hidden', '==', false), where('locked', '==', false)));
  assert.deepEqual(new Set(unlocked.docs.map(d => d.id)), new Set(['t1', 'tLocked']));
  await admin.doc('classes/c1/items/i1/tasks/tLocked').update({ locked: true });
  await getDoc(doc(learner, bodyPath));
  await admin.doc(taskPath).update({ hidden: true });
  await denied('hidden task content is unavailable to its learner', () => getDoc(doc(learner, taskPath)));
  await denied('hidden task body is unavailable to its learner', () => getDoc(doc(learner, bodyPath)));
  await getDoc(doc(teacher, taskPath));
  await admin.doc(taskPath).update({ hidden: false });
  await admin.doc('classes/c1/items/i1').update({ locked: true });
  await denied('locked lesson task content is unavailable to its learner', () => getDoc(doc(learner, taskPath)));
  await denied('locked lesson task body is unavailable to its learner', () => getDoc(doc(learner, bodyPath)));
  await admin.doc('classes/c1/items/i1').update({ locked: false, hidden: true });
  await denied('hidden lesson task content is unavailable to its learner', () => getDoc(doc(learner, taskPath)));
  await admin.doc('classes/c1/items/i1').update({ hidden: false });
  await getDoc(doc(learner, taskPath));
  await admin.doc('classes/c1/video/host').set({ token: 'emulator-only-host-token' });
  await getDoc(doc(teacher, 'classes/c1/video/host'));
  await denied('view-only co-teacher cannot read the video host token', () => getDoc(doc(viewer, 'classes/c1/video/host')));
  await denied('learner cannot read the video host token', () => getDoc(doc(learner, 'classes/c1/video/host')));
  await denied('unrelated account cannot download class roster', () => getDoc(doc(outsider, 'classCodes/CLS-234')));
  await getDoc(doc(learner, 'classCodes/CLS-234'));
  await denied('client cannot write an invitation request directly', () => setDoc(doc(outsider, 'invitationRequests/forged'), { name: 'Spam', email: 'spam@example.test', at: new Date() }));
  for (let n = 0; n < 3; n++) await createInvitationRequest(admin, { name: 'Sam', email: 'sam@example.test' }, '127.0.0.1', 1000000);
  await assert.rejects(() => createInvitationRequest(admin, { name: 'Sam', email: 'sam@example.test' }, '127.0.0.1', 1000000), { code: 'resource-exhausted' });
  await denied('learner cannot assume another learner identity', () => updateDoc(doc(learner, 'users/learner'), { learnerId: 'two' }));
  await updateDoc(doc(learner, 'users/learner'), { displayName: 'One Updated' });
  const chat = { members: ['teacher', 'one'], names: { teacher: 'Teacher', one: 'One' }, roles: { teacher: 'teacher', one: 'learner' }, kind: 'group', title: 'Class', classId: 'c1', createdBy: 'teacher', at: 1, lastAt: 1 };
  await setDoc(doc(teacher, 'chats/group'), chat);
  await admin.doc('callRooms/r-test').set({ state: 'free', url: 'https://example.test/r-test' });
  await admin.doc('callRooms/r-second').set({ state: 'free', url: 'https://example.test/r-second' });
  await admin.doc('callRooms/r-third').set({ state: 'free', url: 'https://example.test/r-third' });
  await denied('learner cannot reserve a room directly', () => updateDoc(doc(learner, 'callRooms/r-test'), { state: 'used', by: 'learner', usedAt: Date.now(), for: 'chat:group' }));
  await denied('learner cannot list available room URLs', () => import('firebase/firestore').then(({ getDocs, collection }) => getDocs(collection(learner, 'callRooms'))));
  await assert.rejects(() => reserveCallRoom(admin, 'learner', 'instant:learner'), { code: 'permission-denied' });
  await assert.rejects(() => reserveCallRoom(admin, 'other', 'chat:group'), { code: 'permission-denied' });
  const room1 = await reserveCallRoom(admin, 'learner', 'chat:group');
  const room2 = await reserveCallRoom(admin, 'learner', 'chat:group');
  assert.notEqual(room1.name, room2.name);
  await assert.rejects(() => reserveCallRoom(admin, 'learner', 'chat:group'), { code: 'resource-exhausted' });
  await assert.rejects(() => finishCallRoom(admin, 'other', room1.name), { code: 'permission-denied' });
  await finishCallRoom(admin, 'learner', room1.name);
  const room3 = await reserveCallRoom(admin, 'learner', 'chat:group');
  assert.ok(room3.name !== room1.name && room3.name !== room2.name);
  await denied('learner cannot add a chat member', () => updateDoc(doc(learner, 'chats/group'), { members: ['teacher', 'one', 'two'] }));
  await denied('learner cannot change a chat role', () => updateDoc(doc(learner, 'chats/group'), { 'roles.one': 'teacher' }));
  await denied('learner cannot change class membership metadata', () => updateDoc(doc(learner, 'chats/group'), { classId: 'other-class' }));
  await updateDoc(doc(learner, 'chats/group'), { 'seen.one': 2 });
  await denied('learner cannot change another read receipt', () => updateDoc(doc(learner, 'chats/group'), { 'seen.teacher': 3 }));
  await denied('unrelated learner cannot read chat', () => getDoc(doc(other, 'chats/group')));
  const answer = { learnerUid: 'learner', learnerId: 'one', itemId: 'i1', taskId: 't1', responses: {}, checked: false };
  await setDoc(doc(learner, 'classes/c1/answers/t1_learner'), answer);
  await updateDoc(doc(learner, 'classes/c1/answers/t1_learner'), { responses: { q1: 'answer' } });
  await admin.doc('classes/c1/items/i1/tasks/t1-timed').set({ kind: 'task', hidden: false, locked: false, content: { type: 'doc', content: [] } });
  const timedAnswer = doc(learner, 'classes/c1/answers/t1-timed_learner');
  const timedBase = { learnerUid: 'learner', learnerId: 'one', itemId: 'i1', taskId: 't1-timed' };
  await setDoc(timedAnswer, { ...timedBase, engagement: { version: 1, activeMs: increment(1200), questions: {} }, updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(timedAnswer, { ...timedBase, responses: { q1: 'saved after timing' }, updatedAt: serverTimestamp() }, { merge: true });
  assert.equal((await getDoc(timedAnswer)).data()?.responses?.q1, 'saved after timing');
  await setDoc(timedAnswer, { ...timedBase, engagement: { version: 1, activeMs: increment(600), questions: {} }, updatedAt: serverTimestamp() }, { merge: true });
  await denied('learner cannot forge a checked timed answer', () => updateDoc(timedAnswer, { checked: true }));
  await denied('learner cannot forge a score on timed answer', () => updateDoc(timedAnswer, { score: 100, total: 100 }));
  await denied('learner cannot forge a score', () => updateDoc(doc(learner, 'classes/c1/answers/t1_learner'), { score: 100, total: 100 }));
  await denied('learner cannot submit without server grading', () => updateDoc(doc(learner, 'classes/c1/answers/t1_learner'), { checked: true }));
  await denied('learner cannot create a checked answer', () => setDoc(doc(learner, 'classes/c1/answers/t2_learner'), { ...answer, taskId: 't2', checked: true }));
  await admin.doc('classes/c1/answers/t1_learner').update({ checked: true, score: 1, total: 1 });
  await denied('learner cannot alter answers after grading', () => updateDoc(doc(learner, 'classes/c1/answers/t1_learner'), { responses: { q1: 'changed after checking' } }));
  await denied('learner cannot forge an exam start', () => setDoc(doc(learner, 'classes/c1/examRuns/i_i1_learner'), { scope: 'i_i1', uid: 'learner', startMs: 1, submittedMs: null }));
  await admin.doc('classes/c1/items/i1/tasks/t1').update({ content: { type: 'doc', content: [{ type: 'gap', attrs: { id: 'q1' } }] } });
  await admin.doc('classes/c1/items/i1/tasks/t1/private/key').set({ q1: { kind: 'gap', answers: ['correct'] } });
  await admin.doc('classes/c1/answers/t1_learner').update({ checked: false, score: 0, total: 0, responses: { q1: 'correct' } });
  await assert.rejects(() => assessTaskForLearner(admin, { uid: 'other' }, { classId: 'c1', itemId: 'i1', taskId: 't1' }), { code: 'permission-denied' });
  await assert.rejects(() => assessTaskForLearner(admin, { uid: 'learner', token: { proxyBy: 'teacher' } }, { classId: 'c1', itemId: 'i1', taskId: 't1' }), { code: 'permission-denied' });
  const checked = await assessTaskForLearner(admin, { uid: 'learner' }, { classId: 'c1', itemId: 'i1', taskId: 't1' });
  assert.equal(checked.checked, true);
  assert.equal((await admin.doc('classes/c1/answers/t1_learner').get()).get('score'), 1);
  await admin.doc('classes/c1/answers/t1_learner').update({ checked: false, attempts: 0 });
  await Promise.all([
    assessTaskForLearner(admin, { uid: 'learner' }, { classId: 'c1', itemId: 'i1', taskId: 't1' }),
    assessTaskForLearner(admin, { uid: 'learner' }, { classId: 'c1', itemId: 'i1', taskId: 't1' }),
  ]);
  assert.equal((await admin.doc('classes/c1/answers/t1_learner').get()).get('attempts'), 1, 'concurrent checks must count once');
  await admin.doc('classes/c1/items/i1/tasks/tparts').set({
    kind: 'task', hidden: false, locked: false,
    content: { type: 'doc', content: [
      { type: 'subTask', attrs: { id: 'part1' }, content: [{ type: 'gap', attrs: { id: 'q1' } }] },
      { type: 'subTask', attrs: { id: 'part2' }, content: [{ type: 'gap', attrs: { id: 'q2' } }] },
    ] },
  });
  await admin.doc('classes/c1/items/i1/tasks/tparts/private/key').set({
    q1: { kind: 'gap', answers: ['one'] }, q2: { kind: 'gap', answers: ['two'] },
  });
  await admin.doc('classes/c1/answers/tparts_learner').set({
    learnerUid: 'learner', learnerId: 'one', itemId: 'i1', taskId: 'tparts',
    responses: { q1: 'one', q2: 'two' }, checked: false, checkedParts: [],
  });
  await Promise.all(['part1', 'part2'].map(partId => checkSubTaskForLearner(admin, { uid: 'learner' }, {
    classId: 'c1', itemId: 'i1', taskId: 'tparts', partId, action: 'check',
  })));
  const checkedParts = (await admin.doc('classes/c1/answers/tparts_learner').get()).data();
  assert.deepEqual(new Set(checkedParts.checkedParts), new Set(['part1', 'part2']), 'concurrent part checks must preserve both parts');
  assert.equal(checkedParts.score, 2);
  assert.equal(checkedParts.total, 2);
  assert.equal(checkedParts.attempts, 1);
  await admin.doc('classes/c1/items/exam').set({ type: 'exam', exam: { minutes: 5 }, hidden: false, locked: false });
  const started = await runExamForLearner(admin, { uid: 'learner' }, { classId: 'c1', scope: 'i_exam', action: 'start' }, 1000);
  assert.equal(started.startMs, 1000);
  const repeated = await runExamForLearner(admin, { uid: 'learner' }, { classId: 'c1', scope: 'i_exam', action: 'start' }, 2000);
  assert.equal(repeated.startMs, 1000);
  const submitted = await runExamForLearner(admin, { uid: 'learner' }, { classId: 'c1', scope: 'i_exam', action: 'submit' }, 3000);
  assert.equal(submitted.submittedMs, 3000);
  const handIn = await admin.doc('classes/c1/answers/__exam_exam_learner').get();
  assert.equal(handIn.get('examSubmittedMs'), 3000, 'an exam hand-in is visible to progress screens before marking');
  assert.equal(handIn.get('checked'), false, 'hand-in does not release an answer key');
  console.log('Server assessment and exam ownership checks passed.');
  console.log('Phase 2 Firestore security rules passed.');
} finally {
  for (const { app, db } of clients) { await terminate(db); await deleteApp(app); }
}

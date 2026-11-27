import assert from 'node:assert/strict';
import test from 'node:test';
import { resourceLessonLiveService as service } from '../functions/resource-hub/live.js';

class Snapshot {
  constructor(path, data) { this.id = path.split('/').at(-1); this.value = data; this.exists = data !== undefined; }
  data() { return this.value; }
  get(field) { return field.split('.').reduce((value, key) => value?.[key], this.value); }
}
class Ref {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').at(-1); }
  async get() { return new Snapshot(this.path, this.db.rows.get(this.path)); }
  collection(name) { return new Query(this.db, `${this.path}/${name}`); }
}
class Query {
  constructor(db, path, constraints = []) { this.db = db; this.path = path; this.constraints = constraints; }
  doc(id) { return new Ref(this.db, `${this.path}/${id ?? `auto${++this.db.next}`}`); }
  where(field, op, value) { assert.equal(op, '=='); return new Query(this.db, this.path, [...this.constraints, ['where', field, value]]); }
  orderBy(field, direction) { return new Query(this.db, this.path, [...this.constraints, ['order', field, direction]]); }
  limit(value) { return new Query(this.db, this.path, [...this.constraints, ['limit', value]]); }
  async get() {
    let docs = [...this.db.rows].filter(([path]) => path.startsWith(`${this.path}/`) && path.slice(this.path.length + 1).split('/').length === 1).map(([path, value]) => new Snapshot(path, value));
    for (const [kind, field, value] of this.constraints) {
      if (kind === 'where') docs = docs.filter(d => d.get(field) === value);
      else if (kind === 'order') docs.sort((a, b) => value === 'desc' ? b.get(field) - a.get(field) : a.get(field) - b.get(field));
      else if (kind === 'limit') docs = docs.slice(0, field);
    }
    return { docs };
  }
}
class MemoryDB {
  rows = new Map(); next = 0;
  doc(path) { return new Ref(this, path); }
  collection(path) { return new Query(this, path); }
  async runTransaction(work) {
    const writes = [];
    const tx = {
      get: ref => ref.get(),
      set: (ref, value) => writes.push(() => this.rows.set(ref.path, structuredClone(value))),
      update: (ref, patch) => writes.push(() => {
        const row = structuredClone(this.rows.get(ref.path));
        for (const [field, value] of Object.entries(patch)) {
          const keys = field.split('.'); let target = row;
          for (const key of keys.slice(0, -1)) target = target[key] ??= {};
          target[keys.at(-1)] = structuredClone(value);
        }
        this.rows.set(ref.path, row);
      }),
      delete: ref => writes.push(() => this.rows.delete(ref.path)),
    };
    const result = await work(tx);
    writes.forEach(write => write());
    return result;
  }
}

const teacher = { uid: 'teacher-1', token: { email: 'teacher@example.com' } };
const baseDoc = { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Complete the answer.' }, { type: 'gap', attrs: { id: 'q1', answers: ['Paris'] } }] },
  { type: 'writing', attrs: { id: 'q2', model: 'Sample private model', points: 5 } },
] };
function fixture() {
  const db = new MemoryDB();
  db.rows.set('users/teacher-1', { role: 'teacher' });
  db.rows.set('accounts/teacher-1', { suspended: false });
  const edition = { id: 'published-1', resourceType: 'lesson', title: 'Paris lesson', edition: 7, sections: [
    { id: 'teacher-notes', audience: 'teacher', kind: 'notes', title: 'Do not show', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SECRET TEACHER NOTES' }] }] } },
    { id: 'task-1', audience: 'learner', kind: 'task', title: 'Task one', instructions: 'Answer the questions.', content: baseDoc, layout: 'two-wide', colScroll: 'together',
      identity: { id: 'aid-1', name: 'Activation', colour: '#b4442e', icon: 'activation', privateNote: 'Do not send this' } },
  ] };
  db.rows.set('resourceHubPublished/published-1', edition);
  db.rows.set('resourceHubPublished/published-1/editions/7', edition);
  return db;
}
const req = (action, values = {}) => ({ action, ...values });

test('standalone published lesson: secure guest join, answer, retry, end and teacher results', async () => {
  const db = fixture();
  const start = await service(db, teacher, req('start', { resourceId: 'published-1' }), 1000);
  assert.match(start.code, /^\d{6}$/);
  assert.equal(db.rows.get(`resourceLessonRuns/${start.runId}`).resourceId, 'published-1');
  assert.equal(db.rows.get(`resourceLessonRuns/${start.runId}/privateTasks/task-1`).key.q1.answers[0], 'Paris');
  const joined = await service(db, null, req('join', { code: start.code, name: 'Alex' }), 2000);
  assert.equal(joined.name, 'Alex');
  assert.notEqual(db.rows.get(`resourceLessonRuns/${start.runId}/participants/${joined.pid}`).tokenHash, joined.token);
  const seat = { runId: start.runId, pid: joined.pid, token: joined.token };
  const blank = await service(db, null, req('join', { code: start.code, name: 'Sam' }), 2001);
  const wrong = await service(db, null, req('join', { code: start.code, name: 'Pat' }), 2002);
  const lobby = await service(db, null, req('learnerState', seat), 2001);
  assert.equal(lobby.currentTask, null);
  await service(db, teacher, req('advance', { runId: start.runId, taskId: 'task-1' }), 3000);
  const learner = await service(db, null, req('learnerState', seat), 3001);
  await service(db, null, req('signal', { ...seat, kind: 'hand', value: true }), 3002);
  await service(db, null, req('signal', { ...seat, kind: 'stuck', value: true }), 3003);
  await service(db, null, req('signal', { ...seat, kind: 'reaction', value: 'thumbsup' }), 3004);
  const signalled = await service(db, teacher, req('teacherState', { runId: start.runId }), 3005);
  assert.deepEqual({ hand: signalled.participants[0].signal.hand, stuck: signalled.participants[0].signal.stuck, reaction: signalled.participants[0].signal.reaction }, { hand: true, stuck: true, reaction: 'thumbsup' });
  await assert.rejects(service(db, null, req('signal', { ...seat, token: 'wrong', kind: 'hand', value: false }), 3006), { code: 'permission-denied' });
  await assert.rejects(service(db, null, req('signal', { ...seat, kind: 'reaction', value: 'unlisted' }), 3006), { code: 'invalid-argument' });
  assert.deepEqual(learner.tasks, [{ id: 'task-1', title: 'Task one' }]);
  assert.equal(learner.currentTask.layout, 'two-wide');
  assert.equal(learner.currentTask.colScroll, 'together');
  assert.equal(learner.currentTask.content.content[0].content[1].attrs.answers.length, 0);
  assert.deepEqual(learner.currentTask.identity, { id: 'aid-1', name: 'Activation', colour: '#b4442e', icon: 'activation' });
  assert.equal(JSON.stringify(learner).includes('Do not send this'), false);
  assert.equal(JSON.stringify(learner).includes('SECRET TEACHER NOTES'), false);
  assert.equal(JSON.stringify(learner).includes('Sample private model'), false);
  assert.equal(JSON.stringify(learner).includes('Paris'), true); // title is public; answer key is stripped below.
  assert.equal('key' in learner.currentTask, false);
  const response = { q1: 'Paris', q2: 'A long response' };
  const first = await service(db, null, req('submit', { ...seat, taskId: 'task-1', responses: response }), 4000);
  assert.equal(first.grading.q1.status, 'correct');
  assert.equal(first.grading.q2.status, 'ungraded');
  assert.equal(first.got, 1);
  const skipped = await service(db, null, req('submit', { runId: blank.runId, pid: blank.pid, token: blank.token, taskId: 'task-1', responses: {} }), 4000);
  assert.equal(skipped.grading.q1.status, 'unanswered');
  assert.equal(skipped.answered, 0);
  const incorrect = await service(db, null, req('submit', { runId: wrong.runId, pid: wrong.pid, token: wrong.token, taskId: 'task-1', responses: { q1: 'London' } }), 4000);
  assert.equal(incorrect.grading.q1.status, 'incorrect');
  const again = await service(db, null, req('submit', { ...seat, taskId: 'task-1', responses: response }), 4001);
  assert.deepEqual(again.grading, first.grading);
  const edited = await service(db, null, req('submit', { ...seat, taskId: 'task-1', responses: { q1: 'London' } }), 4002);
  assert.equal(edited.grading.q1.status, 'incorrect');
  const restored = await service(db, null, req('submit', { ...seat, taskId: 'task-1', responses: response }), 4003);
  assert.equal(restored.grading.q1.status, 'correct');
  const live = await service(db, teacher, req('teacherState', { runId: start.runId }), 5000);
  assert.equal(live.participants.length, 3);
  assert.equal(live.answers.find(answer => answer.pid === joined.pid).responses.q1, 'Paris');
  const result = await service(db, teacher, req('result', { runId: start.runId, taskId: 'task-1' }), 5001);
  assert.equal(result.participants.find(p => p.pid === joined.pid).summaries['task-1'].got, 1);
  assert.equal(result.answers.find(answer => answer.pid === joined.pid).grading.q2.status, 'ungraded');
  assert.equal(result.task.title, 'Task one');
  await service(db, teacher, req('end', { runId: start.runId }), 6000);
  await assert.rejects(service(db, null, req('signal', { ...seat, kind: 'hand', value: false }), 6001), { code: 'failed-precondition' });
  assert.equal(db.rows.has(`resourceLessonCodes/${start.code}`), false);
  await assert.rejects(service(db, null, req('submit', { ...seat, taskId: 'task-1', responses: { q1: 'London' } }), 6001), { code: 'failed-precondition' });
  await assert.rejects(service(db, null, req('join', { code: start.code, name: 'Pat' }), 6001), { code: 'not-found' });
  const history = await service(db, teacher, req('history', { resourceId: 'published-1' }), 6002);
  assert.equal(history.runs[0].status, 'ended');
  assert.equal(history.runs[0].joinOpen, false);
});

test('join attempts are bounded by server-observed address', async () => {
  const db = fixture();
  const start = await service(db, teacher, req('start', { resourceId: 'published-1' }), 1000);
  for (let i = 0; i < 240; i++) await service(db, null, req('join', { code: '000000', name: 'Alex' }), 2000, { ip: '192.0.2.1' }).catch(() => {});
  await assert.rejects(service(db, null, req('join', { code: start.code, name: 'Alex' }), 2000, { ip: '192.0.2.1' }), { code: 'resource-exhausted' });
});

test('personal and organisation lesson files can run live without publishing; Class-origin and viewer files cannot', async () => {
  const db = fixture();
  db.rows.set('sharedDocs/personal-1', { kind: 'lesson', standaloneLesson: true, owner: teacher.uid, title: 'My lesson', members: {} });
  db.rows.set('sharedDocs/personal-1/tasks/intro', { kind: 'section', order: 0, title: 'Introduction', content: { type: 'doc', content: [] } });
  db.rows.set('sharedDocs/personal-1/tasks/task-a', { kind: 'task', order: 1, title: 'Question', instructions: 'Fill this in', content: baseDoc });
  const personal = await service(db, teacher, req('start', { fileId: 'personal-1' }), 1000);
  const personalRun = db.rows.get(`resourceLessonRuns/${personal.runId}`);
  assert.equal(personalRun.sourceKind, 'file');
  assert.equal(personalRun.fileId, 'personal-1');
  assert.equal(personalRun.resourceId, null);
  assert.deepEqual(personalRun.taskIds, ['task-a']);
  const person = await service(db, null, req('join', { code: personal.code, name: 'Mina' }), 1001);
  await service(db, teacher, req('advance', { runId: personal.runId, taskId: 'task-a' }), 1002);
  const task = await service(db, null, req('learnerState', { runId: person.runId, pid: person.pid, token: person.token }), 1003);
  assert.deepEqual(task.currentTask.content.content[0].content[1].attrs.answers, []);
  const fileHistory = await service(db, teacher, req('history', { fileId: 'personal-1' }), 1004);
  assert.equal(fileHistory.runs[0].fileId, 'personal-1');

  db.rows.set('users/editor-2', { role: 'teacher' });
  db.rows.set('accounts/editor-2', { suspended: false });
  const editor = { uid: 'editor-2', token: { email: 'editor@example.com' } };
  db.rows.set('sharedDocs/library-1', { kind: 'lesson', standaloneLesson: true, owner: 'library-owner', title: 'Library lesson', members: { 'editor-2': { role: 'edit', kind: 'teacher' } } });
  db.rows.set('sharedDocs/library-1/tasks/task-b', { kind: 'task', order: 0, title: 'Library task', content: baseDoc });
  const library = await service(db, editor, req('start', { fileId: 'library-1' }), 1000);
  assert.equal(db.rows.get(`resourceLessonRuns/${library.runId}`).owner, editor.uid);
  db.rows.set('sharedDocs/library-1', { kind: 'lesson', standaloneLesson: true, owner: 'library-owner', title: 'Library lesson', members: { 'editor-2': { role: 'view', kind: 'teacher' } } });
  await assert.rejects(service(db, editor, req('start', { fileId: 'library-1' }), 1000), { code: 'permission-denied' });
  db.rows.set('sharedDocs/class-copy', { kind: 'lesson', owner: teacher.uid, title: 'Class copy', originClassId: 'class-123', members: {} });
  db.rows.set('sharedDocs/class-copy/tasks/task-a', { kind: 'task', order: 0, title: 'Class task', content: baseDoc });
  await assert.rejects(service(db, teacher, req('start', { fileId: 'class-copy' }), 1000), { code: 'not-found' });
  db.rows.set('sharedDocs/old-class-copy', { kind: 'lesson', owner: teacher.uid, title: 'Older Class copy', members: {} });
  db.rows.set('sharedDocs/old-class-copy/tasks/task-a', { kind: 'task', order: 0, title: 'Class task', content: baseDoc });
  await assert.rejects(service(db, teacher, req('start', { fileId: 'old-class-copy' }), 1000), { code: 'not-found' });
  await assert.rejects(service(db, teacher, req('start', { classId: 'class-123', itemId: 'lesson-123' }), 1000), { code: 'invalid-argument' });
});

test('Class lessons, drafts, suspended/proxy users and invalid seat tokens cannot access standalone sessions', async () => {
  const db = fixture();
  db.rows.set('resourceHubPublished/class-copy', { resourceType: 'class', edition: 1 });
  await assert.rejects(service(db, teacher, req('start', { resourceId: 'class-copy' }), 1000), { code: 'not-found' });
  await assert.rejects(service(db, teacher, req('start', { resourceId: 'not-published' }), 1000), { code: 'not-found' });
  await assert.rejects(service(db, { ...teacher, token: { proxyBy: 'admin' } }, req('start', { resourceId: 'published-1' }), 1000), { code: 'unauthenticated' });
  db.rows.set('accounts/teacher-1', { suspended: true });
  await assert.rejects(service(db, teacher, req('start', { resourceId: 'published-1' }), 1000), { code: 'permission-denied' });
  db.rows.set('accounts/teacher-1', { suspended: false });
  const start = await service(db, teacher, req('start', { resourceId: 'published-1' }), 1000);
  const joined = await service(db, null, req('join', { code: start.code, name: 'Alex' }), 2000);
  const seat = { runId: start.runId, pid: joined.pid, token: 'wrong' };
  await assert.rejects(service(db, null, req('learnerState', seat), 2001), { code: 'permission-denied' });
  db.rows.set('users/other-teacher', { role: 'teacher' });
  db.rows.set('accounts/other-teacher', { suspended: false });
  await assert.rejects(service(db, { uid: 'other-teacher', token: {} }, req('teacherState', { runId: start.runId }), 2001), { code: 'not-found' });
  await assert.rejects(service(db, { uid: 'other-teacher', token: {} }, req('result', { runId: start.runId, taskId: 'task-1' }), 2001), { code: 'not-found' });
  await assert.rejects(service(db, null, req('join', { code: start.code, name: 'Pat' }), 1000 + 4 * 60 * 60 * 1000), { code: 'not-found' });
  const noCode = await service(db, teacher, req('teacherState', { runId: start.runId }), 1000 + 4 * 60 * 60 * 1000);
  assert.equal(noCode.code, null);
  assert.equal(noCode.run.joinOpen, false);
  const expired = await service(db, null, req('learnerState', { ...seat, token: joined.token }), 1000 + 8 * 60 * 60 * 1000);
  assert.equal(expired.run.expired, true);
});

test('communicative cards never enter a standalone learner response', async () => {
  const activity = id => ({ type: 'communicativeActivity', attrs: { ...(id ? { id } : {}), kind: 'cue', settings: { mode: 'class', privateNote: 'SECRET_SETTING' } }, content: [
    { type: 'activityItem', attrs: { activityItemId: 'card-a', title: 'SECRET_CARD', picture: { src: 'private-activity:user~teacher-1:secret-picture', alt: 'SECRET_PICTURE' } }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SECRET_CARD_TEXT' }] }] },
  ] });
  for (const id of ['activity-1', undefined]) {
    const db = fixture();
    const source = db.rows.get('resourceHubPublished/published-1/editions/7');
    source.sections[1].content = { type: 'doc', content: [activity(id)] };
    await assert.rejects(service(db, teacher, req('start', { resourceId: 'published-1' }), 1000), { code: 'failed-precondition' });
    assert.equal([...db.rows.keys()].some(path => path.startsWith('resourceLessonRuns/')), false, 'a blocked activity must not create a live run');
  }

  const db = fixture();
  const start = await service(db, teacher, req('start', { resourceId: 'published-1' }), 1000);
  const joined = await service(db, null, req('join', { code: start.code, name: 'Mina' }), 1001);
  await service(db, teacher, req('advance', { runId: start.runId, taskId: 'task-1' }), 1002);
  const privateTask = db.rows.get(`resourceLessonRuns/${start.runId}/privateTasks/task-1`);
  privateTask.content = { type: 'doc', content: [activity(undefined)] }; // Legacy task without an id bypassed splitKey's activity seal.
  privateTask.instrDoc = { type: 'doc', content: [activity('instruction-activity')] };
  const learner = await service(db, null, req('learnerState', { runId: start.runId, pid: joined.pid, token: joined.token }), 1003);
  assert.equal(learner.currentTask.content.content[0].attrs.sealed, true);
  assert.deepEqual(learner.currentTask.content.content[0].content, []);
  assert.equal(learner.currentTask.instrDoc.content[0].attrs.sealed, true);
  assert.equal(JSON.stringify(learner).includes('SECRET_'), false, 'no private card, setting or picture may cross the callable boundary');
});

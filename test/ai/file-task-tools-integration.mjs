// Firestore emulator and a fake AI provider: no paid generation or production writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Firestore emulator required');
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: 'demo-file-task-ai' });
const db = getFirestore();
const { fileTaskTools } = await import('../../functions/ai/file-task-tools.js');
const { splitKey } = await import('../../functions/ai/import-question-core.js');
const uid = 'file-ai-owner', fileId = 'file-ai-lesson';
await db.doc(`users/${uid}`).set({ role: 'teacher' });
await db.doc(`accounts/${uid}`).set({});
await db.doc(`aiPilot/${uid}`).set({ enabled: true });
await db.doc(`aiAllowances/${uid}`).set({ limits: { lessonActivities: 100 } });
const file = db.doc(`sharedDocs/${fileId}`);
await file.set({ owner: uid, kind: 'lesson', title: 'Yesterday', standaloneLesson: true });
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yesterday I ' }, { type: 'gap', attrs: { id: 'missing', answers: [] } }, { type: 'text', text: ' home.' }] }] };
await file.collection('tasks').doc('first').set({ kind: 'task', order: 0, title: 'Complete', instructions: 'Use the past tense.', content });
const body = { blocks: [], definitions: [], structures: [], subTasks: [], visuals: [], input: 'Yesterday in the park.', questions: [{ format: 'choice', acceptedAnswers: [], prompt: 'Yesterday I ___ to the park.', options: ['went', 'go'], answer: 'went', explanation: 'Past time.' }] };
const activity = { stageId: 'tool', title: 'Yesterday in the park', format: 'choice', mediaPlan: [], layout: 'stacked', imageLayout: 'row', teacherOnlyInput: '', roles: [], minutes: 10, instructions: 'Choose the correct word.', ...body, inlineElements: [], versions: [], teacherNotes: 'Check the past form.', support: '', challenge: '' };
let generations = 0;
const generateFn = async args => {
  generations++;
  let value;
  if (args.name === 'task_edit') value = { summary: 'Clearer title.', changes: [{ path: 'title', before: args.input.sourceTasks[0].title, after: 'A memorable day' }], answers: [] };
  else if (args.name === 'task_keys') value = { entries: [{ taskId: 'first', questionId: 'missing', answerJson: '{"answers":["went"]}', reason: 'Past time.' }], issues: [] };
  else value = { title: 'Yesterday', rationale: 'Past tense practice.', differentiation: 'No class data.', recycling: 'No class data.', tasks: [activity] };
  return { value, usage: { inputTokens: 100, outputTokens: 100 } };
};
const call = (data, user = uid) => fileTaskTools({ auth: { uid: user, token: {} }, data: { fileId, direction: '', ...data } }, { db, uid: user, apiKey: 'test-only', model: 'gpt-6.1-sol', enabled: 'true', generateFn });

const next = await call({ action: 'fileTaskAiDraft', mode: 'next', requestId: 'next' });
assert.equal(next.status, 'completed');
assert.equal(next.result.key.q0_0.correct, 0);
assert.equal((await file.collection('tasks').get()).size, 1, 'drafting leaves the file untouched');
const added = await call({ action: 'fileTaskAiApply', requestId: 'next' });
assert.equal(added.applied, true);
assert.equal((await call({ action: 'fileTaskAiApply', requestId: 'next' })).taskId, added.taskId, 'apply is idempotent');
const loaded = await file.collection('tasks').doc(added.taskId).get();
assert.equal(loaded.get('title'), 'Yesterday in the park');
assert.equal(splitKey(loaded.get('content')).key.q0_0.correct, 0, 'a reloaded file retains the inline question key');
assert.equal(loaded.get('teacherNotes'), undefined, 'teacher notes are absent from member-readable task rows');
assert.match((await file.collection('taskNotes').doc(added.taskId).get()).get('text'), /Check the past form/);

const answers = await call({ action: 'fileTaskAiDraft', mode: 'answers', taskId: 'first', requestId: 'answers' });
assert.equal(answers.result.entries.length, 1);
await call({ action: 'fileTaskAiApply', requestId: 'answers' });
assert.deepEqual(splitKey((await file.collection('tasks').doc('first').get()).get('content')).key.missing.answers, ['went']);

const edit = await call({ action: 'fileTaskAiDraft', mode: 'edit', taskId: added.taskId, requestId: 'edit', direction: 'Make the title clearer.' });
assert.equal(edit.result.title, 'A memorable day');
await call({ action: 'fileTaskAiApply', requestId: 'edit' });
assert.equal((await file.collection('tasks').doc(added.taskId).get()).get('title'), 'A memorable day');

const version = await call({ action: 'fileTaskAiDraft', mode: 'differentiate', taskId: 'first', requestId: 'version', variantLabel: 'Supported' });
assert.equal(version.status, 'completed');
const variant = await call({ action: 'fileTaskAiApply', requestId: 'version' });
assert.equal((await file.collection('tasks').doc(variant.taskId).get()).get('title'), 'Supported · Complete');

await call({ action: 'fileTaskAiDraft', mode: 'edit', taskId: added.taskId, requestId: 'stale', direction: 'Change the title.' });
await file.collection('tasks').doc(added.taskId).update({ title: 'Manually changed' });
await assert.rejects(call({ action: 'fileTaskAiApply', requestId: 'stale' }), /changed/);
await assert.rejects(call({ action: 'fileTaskAiDraft', mode: 'next', requestId: 'intruder' }, 'someone-else'), /own this Lesson/);
assert.equal(generations, 5);
console.log('PASS standalone AI: owner gate, optional blank direction, review before apply, reloadable inline key, answers, edit, differentiation, stale draft and idempotency (fake provider).');

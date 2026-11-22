import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { activityInstructions, checkActivities, nativeTask, taskCreationSchema } from './activities.js';
import { editableTaskFields, editInstructions, editSchema, applyTaskTextEdits } from './task-edit.js';
import { taskQuestions, checkedKey, hasAnswer, keyInstructions } from './task-keys.js';
import { mergeKey, splitKey } from './import-question-core.js';
import { generate } from './provider.js';
import { generateChecked } from './recovery.js';
import { usageContext, chargeFeature } from './feature-usage.js';
import { checkModel, reserveBudget, settleBudget } from './budget.js';
import { encodeGenerationResult, readGenerationResult } from './storage.js';

const validId = value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value);
const fail = message => { throw new HttpsError('failed-precondition', message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const text = { type: 'string', maxLength: 2500 };
const answerSchema = object({ entries: { type: 'array', maxItems: 100, items: object({ taskId: text, questionId: text, answerJson: { type: 'string', maxLength: 18000 }, reason: text }) }, issues: { type: 'array', maxItems: 30, items: text } });
const sourceRows = (docs, noteDocs = []) => docs.filter(doc => doc.get('kind') === 'task').map(doc => {
  const row = doc.data(), separated = splitKey(row.content ?? { type: 'doc', content: [{ type: 'paragraph' }] });
  return { id: doc.id, title: row.title ?? '', instructions: row.instructions ?? '', content: separated.content, key: separated.key, notes: noteDocs.find(note => note.id === doc.id)?.get('text') ?? '', order: row.order ?? 0 };
});
const scopeFor = (mode, rows, taskId) => mode === 'next' || mode === 'answers' && !taskId ? rows : rows.filter(row => row.id === taskId);
const sourceHash = rows => hash(rows);

export function fileTaskDraftResult(mode, value, scope, minutes) {
  if (mode === 'edit') {
    const edited = applyTaskTextEdits(scope[0], value);
    return { title: edited.title, instructions: edited.instructions, content: edited.content, key: edited.key, notes: edited.notes, summary: value.summary };
  }
  if (mode === 'answers') {
    const missing = new Map(scope.flatMap(row => [...taskQuestions(row.content)].filter(([questionId, node]) =>
      ['gap', 'choice', 'mcq', 'match', 'dropgap', 'order', 'writing', 'pq'].includes(node.type) && !hasAnswer(row.key[questionId]))
      .map(([questionId, node]) => [row.id + ':' + questionId, { row, node, questionId }])));
    const seen = new Set(), entries = [];
    for (const entry of value.entries) {
      const token = entry.taskId + ':' + entry.questionId, target = missing.get(token);
      if (!target || seen.has(token)) throw Error('Only missing answers in the selected lesson may be filled.');
      seen.add(token);
      entries.push({ taskId: entry.taskId, questionId: entry.questionId, key: checkedKey(target.node, JSON.parse(entry.answerJson)), reason: entry.reason });
    }
    return { entries, issues: value.issues };
  }
  checkActivities(value, { stages: [{ id: 'tool', minutes }] }, false, true);
  if (value.tasks.length !== 1 || value.tasks[0].mediaPlan.length) throw Error('This draft needs media; use a Class lesson for media generation.');
  const activity = value.tasks[0], native = nativeTask(activity, 0);
  return { title: activity.title, instructions: activity.subTasks.length ? '' : activity.instructions, content: native.content, key: native.key, notes: native.notes };
}

// A Lesson file has public task rows rather than the Class lesson's private key
// subcollections. Keep its drafts and apply transaction separate from Class tools.
export async function fileTaskTools(req, { db, uid, apiKey, model, enabled, generateFn = generate }) {
  const d = req.data ?? {};
  if (!validId(d.fileId)) fail('Open a Lesson file first.');
  const file = db.doc(`sharedDocs/${d.fileId}`), saved = await file.get();
  if (!saved.exists || saved.get('kind') !== 'lesson' || saved.get('owner') !== uid || saved.get('deletedAt'))
    throw new HttpsError('permission-denied', 'You need to own this Lesson file to use its AI tools.');
  const isDraft = d.action === 'fileTaskAiDraft';
  if (!isDraft && !['fileTaskAiStatus', 'fileTaskAiApply'].includes(d.action)) fail('Choose a Lesson AI action.');
  if (!validId(d.requestId)) fail('Choose a draft.');
  const job = db.doc(`aiPrivate/${uid}/jobs/${d.requestId}`);
  if (!isDraft) {
    const record = await job.get();
    if (!record.exists || record.get('action') !== 'fileTaskAiDraft' || record.get('fileId') !== d.fileId) fail('This draft is no longer available.');
    if (record.get('status') !== 'completed') return { status: record.get('status'), error: record.get('error') ?? '' };
    const result = readGenerationResult(record.data());
    if (d.action === 'fileTaskAiStatus') return { status: 'completed', result };
    if (record.get('appliedTaskId')) return { applied: true, taskId: record.get('appliedTaskId') };
    const target = file.collection('tasks').doc('ai_' + d.requestId);
    let appliedId = '';
    await db.runTransaction(async tx => {
      const [now, liveJob, query, noteQuery] = await Promise.all([tx.get(file), tx.get(job), tx.get(file.collection('tasks').orderBy('order')), tx.get(file.collection('taskNotes'))]);
      if (!now.exists || now.get('owner') !== uid || now.get('kind') !== 'lesson' || now.get('deletedAt')) fail('You no longer own this Lesson file.');
      if (liveJob.get('appliedTaskId')) { appliedId = liveJob.get('appliedTaskId'); return; }
      const current = scopeFor(record.get('mode'), sourceRows(query.docs, noteQuery.docs), record.get('taskId'));
      if (sourceHash(current) !== record.get('sourceHash')) fail('This lesson changed while the draft was being made. Prepare a new AI draft.');
      if (record.get('mode') === 'answers') {
        const grouped = new Map();
        for (const entry of result.entries) grouped.set(entry.taskId, { ...(grouped.get(entry.taskId) ?? {}), [entry.questionId]: entry.key });
        for (const row of current) if (grouped.has(row.id)) tx.update(file.collection('tasks').doc(row.id), { content: mergeKey(row.content, { ...row.key, ...grouped.get(row.id) }) });
        appliedId = current[0]?.id ?? 'lesson';
      } else if (record.get('mode') === 'edit') {
        const row = current[0];
        tx.update(file.collection('tasks').doc(row.id), { title: result.title, instructions: result.instructions, content: mergeKey(result.content, result.key) });
        tx.set(file.collection('taskNotes').doc(row.id), { text: result.notes });
        appliedId = row.id;
      } else {
        tx.create(target, { kind: 'task', order: (query.docs.at(-1)?.get('order') ?? -1) + 1, title: record.get('mode') === 'differentiate' ? `${record.get('variantLabel')} · ${current[0].title}` : result.title, instructions: result.instructions, content: mergeKey(result.content, result.key), createdAt: Timestamp.now() });
        tx.set(file.collection('taskNotes').doc(target.id), { text: result.notes });
        appliedId = target.id;
      }
      tx.update(job, { appliedTaskId: appliedId, appliedAt: Timestamp.now() });
    });
    return { applied: true, taskId: appliedId };
  }
  if (enabled !== 'true') fail('The lesson assistant is not enabled for this account yet.');
  const pilot = await db.doc(`aiPilot/${uid}`).get();
  if (pilot.get('enabled') !== true) fail('The lesson assistant is not enabled for this account yet.');
  if (!['next', 'edit', 'differentiate', 'answers'].includes(d.mode)) fail('Choose an AI task action.');
  if (typeof d.direction !== 'string' || d.direction.length > 2500) fail('Use a direction up to 2,500 characters.');
  if (d.mode === 'edit' && !d.direction.trim()) fail('Describe the changes you want beside the Generate button.');
  const [taskQuery, noteQuery] = await Promise.all([file.collection('tasks').orderBy('order').get(), file.collection('taskNotes').get()]);
  const all = sourceRows(taskQuery.docs, noteQuery.docs);
  const selected = all.find(row => row.id === d.taskId), scope = scopeFor(d.mode, all, d.taskId);
  if (d.mode !== 'next' && !scope.length) fail('Select a task first.');
  const minutes = Number.isInteger(d.minutes) && d.minutes >= 1 && d.minutes <= 60 ? d.minutes : 10;
  const context = await usageContext(db, req.auth); checkModel(model);
  const month = new Date().toISOString().slice(0, 7), budget = db.doc(`${context.isAdmin ? 'aiAdminBudgets' : 'aiBudgets'}/${month}`);
  await db.runTransaction(async tx => {
    const [existing, balance] = await Promise.all([tx.get(job), tx.get(budget)]);
    if (existing.exists) fail('This draft request already exists.');
    const reserved = reserveBudget(balance.get('committedMicroUsd') ?? 0, 1, context.isAdmin);
    await chargeFeature(tx, db, context, 'lessonActivities');
    tx.set(budget, { committedMicroUsd: reserved.balance, month }, { merge: true });
    tx.create(job, { action: 'fileTaskAiDraft', fileId: d.fileId, mode: d.mode, taskId: selected?.id ?? '', variantLabel: d.variantLabel === 'Stretch' ? 'Stretch' : 'Supported', sourceHash: sourceHash(scope), status: 'running', reserved: reserved.reserved, createdAt: Timestamp.now() });
  });
  try {
    let schema, name, instructions;
    if (d.mode === 'edit') { schema = editSchema; name = 'task_edit'; instructions = editInstructions; }
    else if (d.mode === 'answers') { schema = answerSchema; name = 'task_keys'; instructions = keyInstructions; }
    else {
      schema = taskCreationSchema(false); name = 'activities';
      schema.properties.tasks.maxItems = 1;
      const task = schema.properties.tasks.items;
      schema.$defs.importElement.anyOf = schema.$defs.importElement.anyOf.filter(branch => !branch.properties.kind.enum[0].startsWith('ca-'));
      task.properties.stageId = { type: 'string', enum: ['tool'] };
      task.properties.minutes = { type: 'integer', minimum: minutes, maximum: minutes };
      task.properties.mediaPlan.maxItems = 0;
      task.properties.roles.maxItems = 0;
      task.properties.versions.maxItems = 0;
      instructions = activityInstructions + '\nCreate exactly one complete task at stageId tool. This Lesson is a standalone file, without a Class profile or learner data. Never claim to know learners or previous results. Do not request any image or audio: mediaPlan must be []. Use editable native text and question elements; include complete answers. For differentiation preserve the selected task’s aim but change scaffolding or demand, not add unrelated work. Keep the draft original and concise.';
    }
    const input = { lessonTitle: saved.get('title') ?? 'Lesson', sourceTasks: scope, selectedTask: selected ?? null, teacherDirection: d.direction, mode: d.mode, minutes, isFirstActivity: all.length === 0, editableFields: d.mode === 'edit' ? editableTaskFields(selected) : [], missingAnswers: d.mode === 'answers' ? scope.flatMap(row => [...taskQuestions(row.content)].filter(([id, node]) => !hasAnswer(row.key[id])).map(([id, node]) => ({ taskId: row.id, questionId: id, type: node.type, attrs: node.attrs }))) : [] };
    if (Buffer.byteLength(JSON.stringify(input)) > 48000) fail('This lesson is too large for one AI draft. Select a single task.');
    const checked = await generateChecked({ generate: generateFn, args: { apiKey, model, schema, name, input, instructions }, decode: value => value, check: value => fileTaskDraftResult(d.mode, value, scope, minutes), reserveRepair: async () => db.runTransaction(async tx => {
      const [b, j] = await Promise.all([tx.get(budget), tx.get(job)]);
      const reservation = reserveBudget(b.get('committedMicroUsd') ?? 0, 1, context.isAdmin);
      tx.update(budget, { committedMicroUsd: reservation.balance }); tx.update(job, { reserved: j.get('reserved') + reservation.reserved });
    }) });
    const result = fileTaskDraftResult(d.mode, checked.value, scope, minutes);
    await db.runTransaction(async tx => {
      const [b, j] = await Promise.all([tx.get(budget), tx.get(job)]);
      const settled = settleBudget(b.get('committedMicroUsd') ?? 0, j.get('reserved'), checked.usage);
      tx.update(budget, { committedMicroUsd: settled.balance });
      tx.update(job, { status: 'completed', ...encodeGenerationResult(result), completedAt: Timestamp.now() });
    });
    return { status: 'completed', result, requestId: d.requestId };
  } catch (error) {
    await db.runTransaction(async tx => {
      const [b, j] = await Promise.all([tx.get(budget), tx.get(job)]);
      const reserved = j.get('reserved') ?? 0;
      tx.update(budget, { committedMicroUsd: Math.max(0, (b.get('committedMicroUsd') ?? 0) - reserved) });
      tx.update(job, { status: 'failed', error: 'This draft could not finish. Your lesson is unchanged. Please try again.', reservationReleased: true });
    });
    return { status: 'failed', error: 'This draft could not finish. Your lesson is unchanged. Please try again.' };
  }
}

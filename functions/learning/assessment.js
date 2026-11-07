import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { questionIds, scoreQuestion } from './question-core.js';

const validId = value => typeof value === 'string' && value.length > 0 && value.length < 150 && !value.includes('/');
const denied = () => new HttpsError('permission-denied', 'This assessment is not available to you.');

export async function assessTaskForLearner(db, auth, data, now = Date.now()) {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token?.proxyBy) throw denied();
  const { classId, itemId, taskId, action = 'check', all = false } = data ?? {};
  if (![classId, itemId, taskId].every(validId) || !['check', 'reset'].includes(action))
    throw new HttpsError('invalid-argument', 'Choose an activity.');
  const root = db.doc(`classes/${classId}`);
  const itemRef = root.collection('items').doc(itemId);
  const taskRef = itemRef.collection('tasks').doc(taskId);
  const answerRef = root.collection('answers').doc(`${taskId}_${uid}`);
  const [member, item, task, answer] = await Promise.all([
    root.collection('members').doc(uid).get(), itemRef.get(), taskRef.get(), answerRef.get(),
  ]);
  if (!member.exists || !item.exists || !task.exists || !answer.exists
      || answer.get('learnerUid') !== uid || answer.get('itemId') !== itemId
      || answer.get('learnerId') !== member.get('learnerId')) throw denied();
  const i = item.data(), t = task.data();
  if (i.hidden || i.locked || t.hidden || t.locked || t.kind === 'section'
      || (t.restricted && !(t.allowed ?? []).includes(member.get('learnerId')))) throw denied();
  const scope = i.type === 'exam' ? `i_${itemId}` : t.exam ? `t_${taskId}` : null;
  if (scope) {
    const run = await root.collection('examRuns').doc(`${scope}_${uid}`).get();
    if (!run.exists || !run.get('submittedMs') || !(i.type === 'exam' ? i.examReleased : t.examReleased)) throw denied();
  }
  if (action === 'reset') {
    if (!answer.get('checked') || t.afterCheck !== 'retry' || scope) throw denied();
  }
  const content = t.restricted ? (await taskRef.collection('private').doc('body').get()).get('content') : t.content;
  const key = (await taskRef.collection('private').doc('key').get()).data() ?? {};
  const responses = answer.get('responses') ?? {};
  const questionResponses = { ...responses };
  const picks = [];
  const visit = node => {
    if (node?.type === 'randomPick' && node.attrs?.play === 'class' && node.attrs?.id) picks.push(String(node.attrs.id));
    node?.content?.forEach(visit);
  };
  visit(content);
  await Promise.all(picks.map(async id => {
    const pick = await root.collection('picks').doc(`${taskId}_${id}`).get();
    if (pick.exists) questionResponses[id] = { h: pick.get('h') ?? [], b: pick.get('b') ?? [] };
  }));
  const questions = questionIds(content, questionResponses);
  const parts = [];
  const collectParts = node => { if (node?.type === 'subTask') parts.push(node); node?.content?.forEach(collectParts); };
  collectParts(content);
  if (!scope && parts.length && !answer.get('checked')) {
    const covered = new Set(parts.flatMap(part => questionIds(part, questionResponses).map(q => q.id)));
    if (questions.length && questions.every(q => covered.has(q.id)))
      throw new HttpsError('failed-precondition', 'Check each part of this activity separately.');
  }
  if (action === 'reset') {
    const kept = {};
    if (!all) for (const q of questions) {
      const score = scoreQuestion(key[q.id], responses[q.id]) ?? { got: 0, max: 0 };
      if ((score.max > 0 && score.got === score.max) || q.type === 'writing')
        if (Object.hasOwn(responses, q.id)) kept[q.id] = responses[q.id];
    }
    await answerRef.update({ responses: kept, checked: false, checkedParts: [], score: FieldValue.delete(), total: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    return { responses: kept, checked: false, key: null };
  }
  if (!answer.get('checked')) {
    const total = questions.reduce((sum, q) => {
      const score = scoreQuestion(key[q.id], responses[q.id]) ?? { got: 0, max: 0 };
      return { score: sum.score + score.got, total: sum.total + score.max };
    }, { score: 0, total: 0 });
    await answerRef.update({ ...total, checked: true, submittedAt: now, attempts: (answer.get('attempts') ?? 0) + 1, updatedAt: FieldValue.serverTimestamp(), late: !!i.due && now > i.due });
  }
  return { key, checked: true };
}

export const assessTask = onCall({ region: 'us-central1', maxInstances: 10 }, request =>
  assessTaskForLearner(getFirestore(), request.auth, request.data));

export async function resubmitCorrectionForLearner(db, auth, data, now = Date.now()) {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token?.proxyBy) throw denied();
  const { classId, taskId, questionId } = data ?? {};
  if (![classId, taskId, questionId].every(validId)) throw new HttpsError('invalid-argument', 'Choose a question.');
  const root = db.doc(`classes/${classId}`);
  const member = await root.collection('members').doc(uid).get();
  if (!member.exists) throw denied();
  const answerRef = root.collection('answers').doc(`${taskId}_${uid}`);
  return db.runTransaction(async tx => {
    const answer = await tx.get(answerRef);
    if (!answer.exists || answer.get('learnerUid') !== uid || answer.get('learnerId') !== member.get('learnerId')) throw denied();
    const correction = answer.get('corrections')?.[questionId];
    if (correction?.status !== 'open') throw new HttpsError('failed-precondition', 'The teacher has not asked for a correction to this answer.');
    tx.update(answerRef, { [`corrections.${questionId}`]: { ...correction, status: 'resubmitted', at: now } });
    return { saved: true };
  });
}

export const resubmitCorrection = onCall({ region: 'us-central1', maxInstances: 10 }, request =>
  resubmitCorrectionForLearner(getFirestore(), request.auth, request.data));

export async function runExamForLearner(db, auth, data, now = Date.now()) {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token?.proxyBy) throw denied();
  const { classId, scope, action } = data ?? {};
  if (!validId(classId) || !validId(scope) || !['start', 'submit'].includes(action) || !/^[it]_[^/]+$/.test(scope))
    throw new HttpsError('invalid-argument', 'Choose an exam.');
  if (scope.startsWith('t_') && !validId(data.itemId)) throw new HttpsError('invalid-argument', 'Choose an exam task.');
  const root = db.doc(`classes/${classId}`);
  const member = await root.collection('members').doc(uid).get();
  if (!member.exists) throw denied();
  const kind = scope.slice(0, 1), id = scope.slice(2);
  const item = await root.collection('items').doc(kind === 'i' ? id : data.itemId).get();
  const task = kind === 't' ? await root.collection('items').doc(data.itemId).collection('tasks').doc(id).get() : null;
  const settings = kind === 'i' && item?.get('type') === 'exam' ? item.get('exam')
    : kind === 't' && task?.exists ? task.get('exam') : null;
  if (!item.exists || !settings || item.get('hidden') || item.get('locked')
      || (kind === 't' && (task.get('hidden') || task.get('locked')))) throw denied();
  const runRef = root.collection('examRuns').doc(`${scope}_${uid}`);
  return db.runTransaction(async tx => {
    const existing = await tx.get(runRef);
    if (action === 'start') {
      if (existing.exists) return { ...existing.data(), alreadyStarted: true };
      const run = { scope, uid, learnerId: member.get('learnerId'), name: member.get('displayName') ?? '', startMs: now, startedAt: FieldValue.serverTimestamp(), submittedMs: null };
      tx.create(runRef, run);
      return { ...run, startedAt: null };
    }
    if (!existing.exists) throw denied();
    if (existing.get('submittedMs')) return { submittedMs: existing.get('submittedMs'), alreadySubmitted: true };
    tx.update(runRef, { submittedMs: now, submittedAt: FieldValue.serverTimestamp() });
    return { submittedMs: now };
  });
}

export const manageExam = onCall({ region: 'us-central1', maxInstances: 10 }, request =>
  runExamForLearner(getFirestore(), request.auth, request.data));

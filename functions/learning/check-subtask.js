import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { isAnswered, questionIds, scoreQuestion } from './question-core.js';

const subTasksOf = (content) => {
  const found = [];
  const walk = (node) => {
    if (node?.type === 'subTask') found.push(node);
    node?.content?.forEach(walk);
  };
  walk(content);
  return found;
};

export async function checkSubTaskForLearner(db, auth, data, now = Date.now()) {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth?.token?.proxyBy) throw new HttpsError('permission-denied', 'This task is not available to you.');
  const { classId, itemId, taskId, partId, action } = data ?? {};
  if (![classId, itemId, taskId].every((x) => typeof x === 'string' && x.length > 0 && x.length < 150) || !['check', 'read'].includes(action))
    throw new HttpsError('invalid-argument', 'Choose a task and a part.');
  const root = db.doc(`classes/${classId}`);
  const itemRef = root.collection('items').doc(itemId);
  const taskRef = itemRef.collection('tasks').doc(taskId);
  const answerRef = root.collection('answers').doc(`${taskId}_${uid}`);
  const [member, item, task] = await Promise.all([
    root.collection('members').doc(uid).get(), itemRef.get(), taskRef.get(),
  ]);
  if (!member.exists || !item.exists || !task.exists)
    throw new HttpsError('permission-denied', 'This task is not available to you.');
  const t = task.data(), i = item.data();
  if (i.hidden || i.locked || t.locked || t.hidden || t.kind === 'section' || i.type === 'exam' || t.exam || (t.restricted && !(t.allowed ?? []).includes(member.get('learnerId'))))
    throw new HttpsError('permission-denied', 'This task cannot be checked now.');
  const content = t.restricted
    ? (await taskRef.collection('private').doc('body').get()).get('content')
    : t.content;
  const parts = subTasksOf(content).map((node, index) => ({ id: String(node.attrs?.id || `st${index}`), node }));
  const sharedPicks = [];
  const findSharedPicks = (node) => {
    if (node?.type === 'randomPick' && node.attrs?.play === 'class' && node.attrs?.id) sharedPicks.push(String(node.attrs.id));
    node?.content?.forEach(findSharedPicks);
  };
  findSharedPicks(content);
  const pickResponses = {};
  await Promise.all(sharedPicks.map(async (id) => {
    const pick = await root.collection('picks').doc(`${taskId}_${id}`).get();
    if (pick.exists) pickResponses[id] = { h: pick.get('h') ?? [], b: pick.get('b') ?? [] };
  }));
  const keySnap = await taskRef.collection('private').doc('key').get();
  const fullKey = keySnap.data() ?? {};
  // The answer, checked part list, and frozen responses must come from one transaction. Two
  // simultaneous part checks then retry against the latest state instead of losing one another.
  return db.runTransaction(async tx => {
    const answer = await tx.get(answerRef);
    if (!answer.exists || answer.get('learnerUid') !== uid || answer.get('itemId') !== itemId || answer.get('learnerId') !== member.get('learnerId'))
      throw new HttpsError('permission-denied', 'This task is not available to you.');
    if (action === 'check' && answer.get('checked') === true)
      throw new HttpsError('failed-precondition', 'This task has already been checked.');
    const responses = answer.get('responses') ?? {};
    const questionResponses = { ...responses, ...pickResponses };
    const partQuestions = parts.map(({ id, node }) => ({ id, questions: questionIds(node, questionResponses) }));
    const allQuestions = questionIds(content, questionResponses);
    const covered = new Set(partQuestions.flatMap((part) => part.questions.map((q) => q.id)));
    if (!parts.length || partQuestions.some((part) => !part.questions.length) || allQuestions.some((q) => !covered.has(q.id))) throw new HttpsError('failed-precondition', 'This task uses whole-task checking.');
    const stored = Array.isArray(answer.get('checkedParts')) ? answer.get('checkedParts') : [];
    const target = partQuestions.find((part) => part.id === partId);
    if (action === 'check' && (!target || !target.questions.length || !target.questions.some((q) => isAnswered(responses[q.id]))))
      throw new HttpsError('failed-precondition', 'Answer at least one question in this part first.');
    const checkedParts = action === 'check' && !stored.includes(partId) ? [...stored, partId] : stored;
    const checkedResponses = { ...(answer.get('checkedResponses') ?? {}) };
    if (action === 'check' && !stored.includes(partId)) {
      for (const q of target.questions) checkedResponses[q.id] = responses[q.id] ?? null;
    }
    const visibleIds = new Set(partQuestions.filter((part) => checkedParts.includes(part.id)).flatMap((part) => part.questions.map((q) => q.id)));
    const key = Object.fromEntries([...visibleIds].filter((id) => fullKey[id]).map((id) => [id, fullKey[id]]));
    const complete = parts.every((part) => checkedParts.includes(part.id));
    if (action === 'check') {
      const update = { checkedParts, checkedResponses, updatedAt: FieldValue.serverTimestamp() };
      if (complete) {
        const totals = allQuestions.reduce((sum, q) => {
          const s = scoreQuestion(fullKey[q.id], Object.hasOwn(checkedResponses, q.id) ? checkedResponses[q.id] : responses[q.id]);
          return { score: sum.score + s.got, total: sum.total + s.max };
        }, { score: 0, total: 0 });
        Object.assign(update, totals, { checked: true, submittedAt: now, attempts: (answer.get('attempts') ?? 0) + 1 });
      }
      tx.update(answerRef, update);
    }
    return { checkedParts, key, complete };
  });
}

export const checkSubTask = onCall({ region: 'us-central1', maxInstances: 10 }, request =>
  checkSubTaskForLearner(getFirestore(), request.auth, request.data));

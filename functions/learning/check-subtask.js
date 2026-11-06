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

export const checkSubTask = onCall({ region: 'us-central1', maxInstances: 10 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { classId, itemId, taskId, partId, action } = request.data ?? {};
  if (![classId, itemId, taskId].every((x) => typeof x === 'string' && x.length > 0 && x.length < 150) || !['check', 'read'].includes(action))
    throw new HttpsError('invalid-argument', 'Choose a task and a part.');
  const db = getFirestore();
  const root = db.doc(`classes/${classId}`);
  const itemRef = root.collection('items').doc(itemId);
  const taskRef = itemRef.collection('tasks').doc(taskId);
  const answerRef = root.collection('answers').doc(`${taskId}_${uid}`);
  const [member, item, task, answer] = await Promise.all([
    root.collection('members').doc(uid).get(), itemRef.get(), taskRef.get(), answerRef.get(),
  ]);
  if (!member.exists || !item.exists || !task.exists || !answer.exists || answer.get('learnerUid') !== uid || answer.get('itemId') !== itemId)
    throw new HttpsError('permission-denied', 'This task is not available to you.');
  const t = task.data(), i = item.data();
  if (i.locked || t.locked || t.hidden || t.kind === 'section' || i.type === 'exam' || t.exam || (t.restricted && !(t.allowed ?? []).includes(member.get('learnerId'))))
    throw new HttpsError('permission-denied', 'This task cannot be checked now.');
  const content = t.restricted
    ? (await taskRef.collection('private').doc('body').get()).get('content')
    : t.content;
  const parts = subTasksOf(content).map((node, index) => ({ id: String(node.attrs?.id || `st${index}`), node }));
  const responses = answer.get('responses') ?? {};
  const questionResponses = { ...responses };
  const sharedPicks = [];
  const findSharedPicks = (node) => {
    if (node?.type === 'randomPick' && node.attrs?.play === 'class' && node.attrs?.id) sharedPicks.push(String(node.attrs.id));
    node?.content?.forEach(findSharedPicks);
  };
  findSharedPicks(content);
  await Promise.all(sharedPicks.map(async (id) => {
    const pick = await root.collection('picks').doc(`${taskId}_${id}`).get();
    if (pick.exists) questionResponses[id] = { h: pick.get('h') ?? [], b: pick.get('b') ?? [] };
  }));
  const partQuestions = parts.map(({ id, node }) => ({ id, questions: questionIds(node, questionResponses) }));
  const allQuestions = questionIds(content, questionResponses);
  const covered = new Set(partQuestions.flatMap((part) => part.questions.map((q) => q.id)));
  if (!parts.length || partQuestions.some((part) => !part.questions.length) || allQuestions.some((q) => !covered.has(q.id))) throw new HttpsError('failed-precondition', 'This task uses whole-task checking.');
  const stored = Array.isArray(answer.get('checkedParts')) ? answer.get('checkedParts') : [];
  const target = partQuestions.find((part) => part.id === partId);
  if (action === 'check' && (!target || !target.questions.length || !target.questions.some((q) => isAnswered(responses[q.id]))))
    throw new HttpsError('failed-precondition', 'Answer at least one question in this part first.');
  const checkedParts = action === 'check' && !stored.includes(partId) ? [...stored, partId] : stored;
  const keySnap = await taskRef.collection('private').doc('key').get();
  const fullKey = keySnap.data() ?? {};
  const visibleIds = new Set(partQuestions.filter((part) => checkedParts.includes(part.id)).flatMap((part) => part.questions.map((q) => q.id)));
  const key = Object.fromEntries([...visibleIds].filter((id) => fullKey[id]).map((id) => [id, fullKey[id]]));
  const complete = parts.every((part) => checkedParts.includes(part.id));
  if (action === 'check') {
    const update = { checkedParts, updatedAt: FieldValue.serverTimestamp() };
    if (complete) {
      const totals = allQuestions.reduce((sum, q) => {
        const s = scoreQuestion(fullKey[q.id], responses[q.id]);
        return { score: sum.score + s.got, total: sum.total + s.max };
      }, { score: 0, total: 0 });
      Object.assign(update, totals, { checked: true, submittedAt: Date.now(), attempts: (answer.get('attempts') ?? 0) + 1 });
    }
    await answerRef.update(update);
  }
  return { checkedParts, key, complete };
});

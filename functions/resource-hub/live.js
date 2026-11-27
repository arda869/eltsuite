// Standalone Resource Hub lesson sessions. Guest access is limited to a single
// seat in a published lesson run; Class lessons keep their existing class flow.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { splitKey } from '../ai/import-question-core.js';
import { isAnswered, questionIds, scoreQuestion } from '../learning/question-core.js';
import { cleanName, newCode } from '../quiz/engine.js';

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const CODE = /^\d{6}$/;
const CODE_MS = 4 * 60 * 60 * 1000;
const RUN_MS = 8 * 60 * 60 * 1000;
const MAX_SEATS = 100;
const MAX_RESPONSES = 100;
const MAX_RESPONSE_BYTES = 32_000;
const JOIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_JOINS_PER_IP = 240;
const fail = (code, message) => { throw new HttpsError(code, message); };
const idOf = (value, what = 'lesson') => typeof value === 'string' && ID.test(value) ? value : fail('invalid-argument', `Choose a valid ${what}.`);
const hash = token => createHash('sha256').update(token).digest('hex');
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const runRef = (db, id) => db.doc(`resourceLessonRuns/${id}`);
const codeRef = (db, code) => db.doc(`resourceLessonCodes/${code}`);
const taskRef = (run, id) => run.collection('privateTasks').doc(id);
const seatRef = (run, pid) => run.collection('participants').doc(pid);
const answerRef = (run, taskId, pid) => run.collection('answers').doc(`${taskId}_${pid}`);
const visibleRun = (run, runId, now) => ({ runId, sourceKind: run.sourceKind, resourceId: run.resourceId ?? null, fileId: run.fileId ?? null, title: run.title, edition: run.edition ?? null, status: run.status, currentTaskId: run.currentTaskId, taskIds: run.taskIds, taskTitles: run.taskTitles, startedAt: run.startedAt, endedAt: run.endedAt ?? null, codeExpiresAt: run.codeExpiresAt, expiresAt: run.expiresAt, expired: run.expiresAt <= now, joinOpen: run.status !== 'ended' && run.codeExpiresAt > now && run.expiresAt > now, participantCount: run.participantCount ?? 0 });
const visibleSeat = (snap) => ({ pid: snap.id, name: snap.data().name, joinedAt: snap.data().joinedAt, summaries: snap.data().summaries ?? {}, signal: snap.data().signal ?? {} });
const visibleAnswer = (snap) => ({ id: snap.id, ...snap.data() });

async function teacher(db, auth) {
  if (!auth?.uid || auth.token?.proxyBy || String(auth.token?.email ?? '').endsWith('@learners.lesson-lit.firebaseapp.com')) fail('unauthenticated', 'Sign in as a teacher.');
  const [profile, account] = await Promise.all([db.doc(`users/${auth.uid}`).get(), db.doc(`accounts/${auth.uid}`).get()]);
  if (!profile.exists || profile.get('role') !== 'teacher' || account.get('suspended') === true) fail('permission-denied', 'Teachers only.');
  return auth.uid;
}

async function ownedRun(db, auth, runId) {
  const uid = await teacher(db, auth);
  const ref = runRef(db, idOf(runId, 'session'));
  const snap = await ref.get();
  if (!snap.exists || snap.get('owner') !== uid) fail('not-found', 'This lesson session is unavailable.');
  return { ref, run: snap.data(), uid };
}

async function guestSeat(db, data) {
  const ref = runRef(db, idOf(data.runId, 'session'));
  const pid = idOf(data.pid, 'seat');
  const token = typeof data.token === 'string' ? data.token : '';
  const [run, seat] = await Promise.all([ref.get(), seatRef(ref, pid).get()]);
  if (!run.exists || !seat.exists || !token || !safeEqual(seat.get('tokenHash'), hash(token))) fail('permission-denied', 'Join this lesson with its code again.');
  return { ref, run: run.data(), pid, seat: seat.data() };
}

// An activity type is public: a name, a colour and an icon key, nothing private.
function cleanIdentity(value) {
  if (!value || typeof value !== 'object') return null;
  const name = String(value.name ?? '').trim().slice(0, 40);
  if (!name) return null;
  return { id: String(value.id ?? '').slice(0, 40), name, colour: /^#[0-9a-f]{6}$/i.test(String(value.colour)) ? String(value.colour) : '#1f6aa5', icon: /^[a-z0-9]{1,24}$/.test(String(value.icon ?? '')) ? String(value.icon) : '' };
}

function publicTask(task) {
  return { id: task.id, title: task.title, instructions: task.instructions, instrDoc: task.instrDoc ?? null, content: task.content, layout: task.layout ?? 'single', colScroll: task.colScroll ?? 'separate', versionGroup: task.versionGroup ?? null, versionLabel: task.versionLabel ?? null, identity: task.identity ?? null };
}

function marksFor(content, key, responses) {
  const grading = {};
  let got = 0, max = 0, answered = 0;
  for (const q of questionIds(content, responses)) {
    const hasAnswer = isAnswered(responses[q.id]);
    const score = scoreQuestion(key[q.id], responses[q.id]) ?? { got: 0, max: 0 };
    const status = !hasAnswer ? 'unanswered' : !score.max ? 'ungraded' : score.got === score.max ? 'correct' : score.got > 0 ? 'partial' : 'incorrect';
    grading[q.id] = { answered: hasAnswer, got: score.got, max: score.max, status };
    if (hasAnswer) answered++;
    got += score.got; max += score.max;
  }
  return { grading, got, max, answered };
}

function responseIds(content, responses) {
  const ids = new Set(questionIds(content, responses).map(q => q.id));
  const walk = node => {
    if (!node) return;
    // The random-pick state selects which question cards are visible.
    if (node.type === 'randomPick' && node.attrs?.id) ids.add(node.attrs.id);
    for (const child of node.content ?? []) walk(child);
  };
  walk(content);
  return ids;
}

function sourceRequest(data) {
  if (data?.classId || data?.itemId || (!!data?.fileId === !!data?.resourceId)) fail('invalid-argument', 'Choose one standalone lesson file or published Resource Hub lesson.');
  if (data.fileId) return { kind: 'file', id: idOf(data.fileId, 'lesson file') };
  return { kind: 'resource', id: idOf(String(data.resourceId).replace(/^lesson-/, ''), 'published lesson') };
}

async function loadSource(db, uid, selected) {
  if (selected.kind === 'file') {
    const snapshot = await db.doc(`sharedDocs/${selected.id}`).get();
    const file = snapshot.data();
    if (!file || file.kind !== 'lesson' || file.standaloneLesson !== true || file.deletedAt || file.purgeRequestedAt || file.purgingAt || file.sourceClassId || file.originClassId || file.classId) fail('not-found', 'This standalone lesson file is unavailable.');
    if (file.owner !== uid && file.members?.[uid]?.role !== 'edit') fail('permission-denied', 'You need editing access to teach this lesson file.');
    const rows = await db.collection(`sharedDocs/${selected.id}/tasks`).orderBy('order').get();
    return { sourceKind: 'file', resourceId: null, fileId: selected.id, edition: null, title: file.title, sections: rows.docs.filter(row => row.get('kind') === 'task').map(row => ({ ...row.data(), id: row.id, audience: 'learner', kind: 'task' })) };
  }
  const published = await db.doc(`resourceHubPublished/${selected.id}`).get();
  if (!published.exists || published.get('resourceType') !== 'lesson') fail('not-found', 'Publish this standalone lesson before starting it.');
  const edition = published.get('edition');
  if (!Number.isInteger(edition) || edition < 1) fail('failed-precondition', 'This lesson has no published edition.');
  const immutable = await db.doc(`resourceHubPublished/${selected.id}/editions/${edition}`).get();
  if (!immutable.exists || immutable.get('resourceType') !== 'lesson') fail('failed-precondition', 'The published lesson edition is unavailable.');
  const source = immutable.data();
  return { sourceKind: 'resource', resourceId: selected.id, fileId: null, edition, title: source.title, sections: source.sections ?? [] };
}

/** Exported separately so tests can exercise permissions and persistence without Firebase emulators. */
export async function resourceLessonLiveService(db, auth, data, now = Date.now(), context = {}) {
  const action = data?.action;
  if (action === 'start') {
    const uid = await teacher(db, auth);
    const selected = sourceRequest(data);
    const source = await loadSource(db, uid, selected);
    const sections = (source.sections ?? []).filter(s => s?.audience === 'learner' && s.kind === 'task');
    if (!sections.length || sections.length > 40 || sections.some(s => !ID.test(s.id) || s.content?.type !== 'doc')) fail('failed-precondition', 'This lesson needs learner tasks before it can go live.');
    const tasks = sections.map(s => {
      const { content, key } = splitKey(s.content);
      const instrDoc = s.instrDoc ? splitKey(s.instrDoc).content : null;
      return { id: s.id, title: String(s.title ?? 'Task').slice(0, 160), instructions: String(s.instructions ?? '').slice(0, 5000), instrDoc, content, key, layout: ['two', 'two-wide', 'media'].includes(s.layout) ? s.layout : 'single', colScroll: s.colScroll === 'together' ? 'together' : 'separate', versionGroup: s.versionGroup ?? null, versionLabel: s.versionLabel ?? null, identity: cleanIdentity(s.identity) };
    });
    const ref = db.collection('resourceLessonRuns').doc();
    let code = '';
    for (let attempt = 0; attempt < 8 && !code; attempt++) {
      const candidate = newCode();
      try {
        await db.runTransaction(async tx => {
          const claim = codeRef(db, candidate);
          const prior = await tx.get(claim);
          if (prior.exists && (prior.get('expiresAt') ?? 0) > now) fail('already-exists', 'Code already in use.');
          const run = { owner: uid, sourceKind: source.sourceKind, resourceId: source.resourceId, fileId: source.fileId, edition: source.edition, title: String(source.title ?? 'Lesson').slice(0, 160), status: 'lobby', code: candidate, codeExpiresAt: now + CODE_MS, expiresAt: now + RUN_MS, currentTaskId: null, taskIds: tasks.map(t => t.id), taskTitles: Object.fromEntries(tasks.map(t => [t.id, t.title])), participantCount: 0, startedAt: now, ownerSource: `${uid}:${selected.kind}:${selected.id}` };
          tx.set(ref, run);
          tx.set(claim, { runId: ref.id, expiresAt: now + CODE_MS, deleteAt: new Date(now + CODE_MS + 24 * 60 * 60 * 1000) });
          for (const task of tasks) tx.set(taskRef(ref, task.id), task);
        });
        code = candidate;
      } catch (error) {
        if (error?.code !== 'already-exists') throw error;
      }
    }
    if (!code) fail('resource-exhausted', 'Could not make a lesson code. Try again.');
    return { runId: ref.id, code };
  }

  if (action === 'join') {
    const code = String(data.code ?? '').replace(/\s/g, '');
    if (!CODE.test(code)) fail('invalid-argument', 'Enter the six-digit lesson code.');
    const cleaned = cleanName(data.name);
    if (cleaned.error) fail('invalid-argument', cleaned.error);
    // A shared school connection can admit a full class while repeated code
    // guesses from one address are bounded. The caller cannot choose this key.
    if (context.ip) {
      const limitRef = db.doc(`resourceLessonJoinLimits/${hash(context.ip)}`);
      await db.runTransaction(async tx => {
        const prior = await tx.get(limitRef);
        const activeWindow = prior.exists && prior.get('windowStart') > now - JOIN_WINDOW_MS;
        const start = activeWindow ? prior.get('windowStart') : now;
        const count = activeWindow ? (prior.get('count') ?? 0) + 1 : 1;
        if (count > MAX_JOINS_PER_IP) fail('resource-exhausted', 'Too many join attempts. Try again later.');
        tx.set(limitRef, { windowStart: start, count, expiresAt: new Date(start + JOIN_WINDOW_MS) });
      });
    }
    const claim = await codeRef(db, code).get();
    if (!claim.exists || (claim.get('expiresAt') ?? 0) <= now) fail('not-found', 'This lesson code has expired.');
    const ref = runRef(db, idOf(claim.get('runId'), 'session'));
    const pid = ref.collection('participants').doc().id;
    const token = randomBytes(32).toString('base64url');
    let title = '';
    await db.runTransaction(async tx => {
      const runSnap = await tx.get(ref);
      const run = runSnap.data();
      if (!run || run.code !== code || run.status === 'ended' || run.expiresAt <= now || run.codeExpiresAt <= now) fail('not-found', 'This lesson session has ended or expired.');
      if ((run.participantCount ?? 0) >= MAX_SEATS) fail('resource-exhausted', 'This lesson session is full.');
      title = run.title;
      tx.set(seatRef(ref, pid), { name: cleaned.name, tokenHash: hash(token), joinedAt: now, summaries: {} });
      tx.update(ref, { participantCount: (run.participantCount ?? 0) + 1 });
    });
    return { runId: ref.id, pid, token, name: cleaned.name, title };
  }

  if (action === 'teacherState') {
    const { ref, run } = await ownedRun(db, auth, data.runId);
    const [seats, answers, current] = await Promise.all([
      ref.collection('participants').get(),
      run.currentTaskId ? ref.collection('answers').where('taskId', '==', run.currentTaskId).get() : Promise.resolve({ docs: [] }),
      run.currentTaskId ? taskRef(ref, run.currentTaskId).get() : Promise.resolve(null),
    ]);
    return { run: visibleRun(run, ref.id, now), code: run.status === 'ended' || run.codeExpiresAt <= now || run.expiresAt <= now ? null : run.code, participants: seats.docs.map(visibleSeat), answers: answers.docs.map(visibleAnswer), currentTask: current?.exists ? current.data() : null };
  }

  if (action === 'learnerState') {
    const { ref, run, pid, seat } = await guestSeat(db, data);
    const taskId = run.currentTaskId;
    const [task, answer] = await Promise.all([taskId ? taskRef(ref, taskId).get() : Promise.resolve(null), taskId ? answerRef(ref, taskId, pid).get() : Promise.resolve(null)]);
    return { run: visibleRun(run, ref.id, now), tasks: run.taskIds.map(id => ({ id, title: run.taskTitles[id] })), currentTask: task?.exists ? publicTask(task.data()) : null, responses: answer?.exists ? answer.get('responses') : {}, signal: seat.signal ?? {} };
  }

  if (action === 'signal') {
    const { ref, run, pid } = await guestSeat(db, data);
    if (run.status === 'ended' || run.expiresAt <= now) fail('failed-precondition', 'This lesson session has ended.');
    const kind = data.kind;
    if (kind !== 'hand' && kind !== 'stuck' && kind !== 'reaction') fail('invalid-argument', 'Choose a lesson signal.');
    const value = kind === 'reaction' ? data.value : data.value === true;
    if (kind === 'reaction' && !['thumbsup', 'heart', 'laugh', 'wow', 'clap'].includes(value)) fail('invalid-argument', 'Choose a reaction.');
    return db.runTransaction(async tx => {
      const snap = await tx.get(seatRef(ref, pid));
      if (!snap.exists || !safeEqual(snap.get('tokenHash'), hash(data.token))) fail('permission-denied', 'Join this lesson again.');
      const signal = { ...(snap.get('signal') ?? {}), [kind]: value, updatedAt: now };
      tx.update(seatRef(ref, pid), { signal });
      return { signal };
    });
  }

  if (action === 'submit') {
    const { ref, pid } = await guestSeat(db, data);
    const taskId = idOf(data.taskId, 'task');
    const responses = data.responses;
    if (!responses || typeof responses !== 'object' || Array.isArray(responses) || Object.keys(responses).length > MAX_RESPONSES || JSON.stringify(responses).length > MAX_RESPONSE_BYTES) fail('invalid-argument', 'These answers are too large to save.');
    const target = answerRef(ref, taskId, pid);
    return db.runTransaction(async tx => {
      const [runSnap, seatSnap, taskSnap, prior] = await Promise.all([tx.get(ref), tx.get(seatRef(ref, pid)), tx.get(taskRef(ref, taskId)), tx.get(target)]);
      const run = runSnap.data();
      if (!run || !seatSnap.exists || !safeEqual(seatSnap.get('tokenHash'), hash(data.token)) || !taskSnap.exists) fail('permission-denied', 'Join this lesson again.');
      if (prior.exists && JSON.stringify(prior.get('responses')) === JSON.stringify(responses)) {
        return { ok: true, grading: prior.get('grading'), got: prior.get('got'), max: prior.get('max'), answered: prior.get('answered') };
      }
      if (run.status !== 'running' || run.currentTaskId !== taskId || run.expiresAt <= now) fail('failed-precondition', 'This task has closed or the session has expired.');
      const task = taskSnap.data();
      const allowed = responseIds(task.content, responses);
      if (Object.keys(responses).some(id => !allowed.has(id))) fail('invalid-argument', 'An answer does not belong to this task.');
      const result = marksFor(task.content, task.key, responses);
      tx.set(target, { taskId, pid, name: seatSnap.get('name'), responses, ...result, firstSubmittedAt: prior.exists ? prior.get('firstSubmittedAt') ?? prior.get('submittedAt') : now, submittedAt: now });
      tx.update(seatRef(ref, pid), { [`summaries.${taskId}`]: { got: result.got, max: result.max, answered: result.answered, submittedAt: now } });
      return { ok: true, ...result };
    });
  }

  if (action === 'advance') {
    const { ref } = await ownedRun(db, auth, data.runId);
    const taskId = idOf(data.taskId, 'task');
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const run = snap.data();
      if (!run || run.status === 'ended' || run.expiresAt <= now) fail('failed-precondition', 'This lesson session has ended or expired.');
      if (!run.taskIds.includes(taskId)) fail('invalid-argument', 'Choose a task in this lesson.');
      tx.update(ref, { status: 'running', currentTaskId: taskId, updatedAt: now });
      return { ok: true, currentTaskId: taskId };
    });
  }

  if (action === 'end') {
    const { ref } = await ownedRun(db, auth, data.runId);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get('status') === 'ended') return;
      const claim = codeRef(db, snap.get('code'));
      const code = await tx.get(claim);
      tx.update(ref, { status: 'ended', endedAt: now, updatedAt: now });
      if (code.exists && code.get('runId') === ref.id) tx.delete(claim);
    });
    return { ok: true };
  }

  if (action === 'history') {
    const uid = await teacher(db, auth);
    const selected = sourceRequest(data);
    const rows = await db.collection('resourceLessonRuns').where('ownerSource', '==', `${uid}:${selected.kind}:${selected.id}`).orderBy('startedAt', 'desc').limit(100).get();
    return { runs: rows.docs.map(s => visibleRun(s.data(), s.id, now)) };
  }

  if (action === 'result') {
    const { ref, run } = await ownedRun(db, auth, data.runId);
    const taskId = data.taskId == null ? null : idOf(data.taskId, 'task');
    if (taskId && !run.taskIds.includes(taskId)) fail('invalid-argument', 'Choose a task in this lesson.');
    const [seats, answers, task] = await Promise.all([
      ref.collection('participants').get(),
      taskId ? ref.collection('answers').where('taskId', '==', taskId).get() : Promise.resolve({ docs: [] }),
      taskId ? taskRef(ref, taskId).get() : Promise.resolve(null),
    ]);
    return { run: visibleRun(run, ref.id, now), participants: seats.docs.map(visibleSeat), answers: answers.docs.map(visibleAnswer), task: task?.exists ? publicTask(task.data()) : null };
  }
  fail('invalid-argument', 'Unknown lesson session action.');
}

// Guests may be signed out. Every teacher action checks ownership, and every
// learner action verifies a per-seat bearer token; no client database rules
// grant direct access to the run, keys, participant records or answers.
export const resourceLessonLive = onCall({ region: 'us-central1', maxInstances: 30, concurrency: 80, memory: '512MiB', timeoutSeconds: 60, invoker: 'public' }, request => resourceLessonLiveService(getFirestore(), request.auth, request.data ?? {}, Date.now(), { ip: request.rawRequest?.ip }));

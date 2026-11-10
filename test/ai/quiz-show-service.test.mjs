// The live quiz show's server (functions/quiz/service.js) against in-memory stand-ins for Firestore and
// the Realtime Database. Runs without the Firebase packages: their imports are swapped for tiny fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const fakes = {
  'firebase-functions/v2/https': `export class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }`,
  'firebase-admin/firestore': `export const FieldValue = { increment: (n) => ({ __inc: n }), serverTimestamp: () => ({ __now: true }) };`,
  'firebase-admin/database': `export const ServerValue = { increment: (n) => ({ __inc: n }) };`,
};
register(
  'data:text/javascript,' +
    encodeURIComponent(`const f=${JSON.stringify(fakes)};export async function resolve(s,c,n){if(f[s])return{url:'data:text/javascript,'+encodeURIComponent(f[s]),shortCircuit:true};return n(s,c);}`),
);
const { quizService } = await import('../../functions/quiz/service.js');
const { splitKey } = await import('../../functions/ai/import-question-core.js');

// ---- stand-ins ----------------------------------------------------------------------------------------
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
function apply(target, patch) {
  const out = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split('.');
    let o = out;
    for (const p of parts.slice(0, -1)) o = o[p] = { ...(o[p] || {}) };
    const last = parts.at(-1);
    o[last] = v && v.__inc !== undefined ? (o[last] || 0) + v.__inc : v && v.__now ? Date.now() : v;
  }
  return out;
}
function firestore() {
  const data = new Map();
  let auto = 0;
  let txLock = Promise.resolve();
  const snap = (path) => ({ exists: data.has(path), id: path.split('/').at(-1), ref: docRef(path), data: () => clone(data.get(path)) });
  const docRef = (path) => ({
    path,
    id: path.split('/').at(-1),
    get: async () => snap(path),
    set: async (v, o) => setDoc(path, v, o),
    update: async (v) => {
      if (!data.has(path)) throw Error('missing ' + path);
      data.set(path, apply(data.get(path), v));
    },
    create: async (v) => {
      if (data.has(path)) throw Error('exists');
      data.set(path, clone(v));
    },
    collection: (c) => colRef(path + '/' + c),
  });
  const setDoc = (path, v, o) => {
    if (o?.mergeFields || o?.merge) {
      const flat = {};
      const walk = (obj, pre) => {
        for (const [k, x] of Object.entries(obj)) {
          if (x && typeof x === 'object' && !Array.isArray(x) && x.__inc === undefined && !x.__now && o.merge) walk(x, pre + k + '.');
          else flat[pre + k] = x;
        }
      };
      if (o.mergeFields) for (const f of o.mergeFields) flat[f] = f.split('.').reduce((a, k) => a?.[k], v);
      else walk(v, '');
      data.set(path, apply(data.get(path) || {}, flat));
    } else data.set(path, apply({}, v));
  };
  const colRef = (path) => ({
    doc: (id) => docRef(path + '/' + (id || 'auto' + ++auto)),
    where: (field, _op, value) => ({ get: async () => ({ docs: [...data.keys()].filter((k) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1 && data.get(k)[field] === value).map(snap) }) }),
    get: async () => ({ docs: [...data.keys()].filter((k) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1).map(snap) }),
  });
  const db = {
    doc: docRef,
    collection: colRef,
    runTransaction: (fn) => {
      const run = async () => {
        const ops = [];
        const tx = { get: (r) => r.get(), update: (r, v) => ops.push(() => r.update(v)), set: (r, v, o) => ops.push(() => setDoc(r.path, v, o)) };
        const result = await fn(tx);
        for (const op of ops) await op();
        return result;
      };
      const next = txLock.then(run);
      txLock = next.catch(() => {});
      return next;
    },
    batch: () => {
      const ops = [];
      return { set: (r, v, o) => ops.push(() => setDoc(r.path, v, o)), update: (r, v) => ops.push(() => r.update(v)), delete: (r) => ops.push(() => data.delete(r.path)), commit: async () => { for (const op of ops) await op(); } };
    },
  };
  return { db, data };
}
function realtime() {
  let root = {};
  const at = (path) => path.split('/').filter(Boolean);
  const read = (path) => at(path).reduce((o, k) => (o == null ? undefined : o[k]), root);
  const write = (path, v) => {
    const parts = at(path);
    let o = root;
    for (const p of parts.slice(0, -1)) o = o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {};
    const last = parts.at(-1);
    if (v === null) delete o[last];
    else o[last] = v && v.__inc !== undefined ? (o[last] || 0) + v.__inc : clone(v);
  };
  const ref = (path) => ({
    child: (c) => ref(path + '/' + c),
    get: async () => ({ val: () => clone(read(path)) ?? null }),
    set: async (v) => write(path, v),
    update: async (v) => Object.entries(v).forEach(([k, x]) => write(path + '/' + k, x)),
    remove: async () => write(path, null),
    transaction: async (change) => {
      const next = change(clone(read(path)) ?? null);
      if (next !== undefined) write(path, next);
      return { committed: next !== undefined, snapshot: { val: () => clone(read(path)) ?? null } };
    },
  });
  return { rtdb: { ref }, read };
}
const auth = (uid, email = uid + '@example.com') => ({ uid, token: { email } });

function world() {
  const { db, data } = firestore();
  const { rtdb, read } = realtime();
  const content = { type: 'doc', content: [
    { type: 'mcq', attrs: { id: 'q1', prompt: 'Which is a fruit?', options: ['Apple', 'Chair', 'Bus', 'Pen'], correct: 0 } },
    { type: 'paragraph', content: [{ type: 'text', text: 'She ' }, { type: 'gap', attrs: { id: 'q2', answers: ['goes'] } }, { type: 'text', text: ' to school.' }] },
  ] };
  const { content: pub, key } = splitKey(content);
  data.set('users/teacher', { role: 'teacher', displayName: 'Arda' });
  data.set('users/learner', { role: 'learner', displayName: 'Lina' });
  data.set('classes/c1', { teacherId: 'teacher' });
  data.set('classes/c1/members/learner', { learnerId: 'L1', displayName: 'Lina' });
  data.set('classes/c1/items/i1/tasks/t1', { title: 'Warm-up', content: pub, quiz: { settings: [{ seconds: 20 }, { seconds: 30, points: 2 }] } });
  data.set('classes/c1/items/i1/tasks/t1/private/key', key);
  return { db, data, rtdb, read };
}

test('a class quiz: guests and learners join, answer, and the learner’s answers land in the class record', async () => {
  const w = world();
  const call = (who, d, now) => quizService(w.db, w.rtdb, who, d, now);
  await assert.rejects(call(null, { action: 'host', source: { kind: 'class', classId: 'c1', itemId: 'i1', taskId: 't1' } }), /teacher/);
  await assert.rejects(call(auth('learner', 'l_L1@learners.lesson-lit.firebaseapp.com'), { action: 'host', source: { kind: 'class', classId: 'c1', itemId: 'i1', taskId: 't1' } }), /teacher/);
  const { runId, code } = await call(auth('teacher'), { action: 'host', guests: true, source: { kind: 'class', classId: 'c1', itemId: 'i1', taskId: 't1' } }, 1000);
  assert.match(code, /^\d{6}$/);
  assert.equal(w.read(`quizLive/${runId}/phase`), 'lobby');
  assert.equal(w.read(`quizLive/${runId}/classId`), 'c1', 'game screens need the class media location');
  assert.equal(w.data.get('classes/c1/live/state').liveQuiz.code, code);

  const guest = await call(null, { action: 'join', code, name: 'Sam' }, 2000);
  const twin = await call(null, { action: 'join', code, name: 'sam' }, 2100);
  assert.equal(twin.name, 'sam 2');
  const lina = await call(auth('learner', 'l_L1@learners.lesson-lit.firebaseapp.com'), { action: 'join', code }, 2200);
  assert.equal(lina.name, 'Lina');
  assert.equal(lina.pid, 'learner');
  const again = await call(auth('learner', 'l_L1@learners.lesson-lit.firebaseapp.com'), { action: 'join', code }, 2300);
  assert.equal(again.token, lina.token, 'rejoining keeps the same place');

  // Nobody but the host moves the game on.
  await assert.rejects(call(null, { action: 'next', runId }), /host/);
  await assert.rejects(call(auth('learner'), { action: 'next', runId }), /host/);

  // Question 1 opens at 10 000 with a 3.5 s countdown and 20 s on the clock.
  await call(auth('teacher'), { action: 'next', runId }, 10000);
  const q = JSON.parse(w.read(`quizLive/${runId}/q`));
  assert.equal(q.kind, 'choice');
  assert.ok(!JSON.stringify(q).includes('correct":0'), 'no answer on the phones');
  await assert.rejects(call(null, { action: 'answer', runId, pid: guest.pid, token: 'wrong', slide: 0, responses: { q1: 0 } }, 14000), /not in this game/);
  await call(null, { action: 'answer', runId, pid: guest.pid, token: guest.token, slide: 0, responses: { q1: 0 } }, 13500);
  await assert.rejects(call(null, { action: 'answer', runId, pid: guest.pid, token: guest.token, slide: 0, responses: { q1: 1 } }, 13600), /already answered/);
  await call(null, { action: 'answer', runId, pid: lina.pid, token: lina.token, slide: 0, responses: { q1: 0 } }, 23500);
  await call(null, { action: 'answer', runId, pid: twin.pid, token: twin.token, slide: 0, responses: { q1: 2 } }, 15000);
  await call(null, { action: 'answer', runId, pid: twin.pid, token: twin.token, slide: 0, responses: { q1: 2 } }, 40000);
  assert.equal(Object.keys(w.read(`quizLive/${runId}/answeredBy/0`)).length, 3);
  await call(auth('teacher'), { action: 'close', runId }, 34000);
  const players = w.read(`quizLive/${runId}/players`);
  assert.equal(players[guest.pid].s, 1000, 'instant right answer');
  assert.equal(players[lina.pid].s, 750, 'right after half the time');
  assert.equal(players[twin.pid].s, 0);
  assert.equal(players[guest.pid].r, 1);
  const reveal = JSON.parse(w.read(`quizLive/${runId}/reveal`));
  assert.deepEqual(reveal.counts, [2, 0, 1]);
  assert.deepEqual(reveal.correct, [0]);

  // A game has its own class attempt; it cannot overwrite an ordinary task answer.
  const rec = w.data.get(`classes/c1/gameAttempts/${runId}_learner`);
  assert.equal(rec.responses.q1, 0);
  assert.equal(rec.score, 1);
  assert.equal(rec.itemId, 'i1');
  assert.equal(rec.learnerId, 'L1');

  // Question 2: double points, a gap. Lina gets it right, building a streak.
  await call(auth('teacher'), { action: 'board', runId }, 35000);
  await call(auth('teacher'), { action: 'next', runId }, 40000);
  await call(null, { action: 'answer', runId, pid: lina.pid, token: lina.token, slide: 1, responses: { q2: 'Goes' } }, 43500);
  await call(auth('teacher'), { action: 'close', runId }, 75000);
  const after = w.read(`quizLive/${runId}/players`);
  assert.equal(after[lina.pid].s, 750 + 2000 + 100, 'double points plus a streak bonus');
  assert.equal(after[lina.pid].r, 1);
  const rec2 = w.data.get(`classes/c1/gameAttempts/${runId}_learner`);
  assert.deepEqual([rec2.responses.q1, rec2.responses.q2], [0, 'Goes'], 'answers from both questions are kept together');
  assert.deepEqual([rec2.score, rec2.total], [2, 2]);

  // The end: podium, then the code stops working and the class banner goes.
  await call(auth('teacher'), { action: 'next', runId }, 80000);
  assert.equal(w.read(`quizLive/${runId}/phase`), 'podium');
  await call(auth('teacher'), { action: 'end', runId }, 90000);
  assert.equal(w.data.get('classes/c1/live/state').liveQuiz, null);
  await assert.rejects(call(null, { action: 'join', code, name: 'Late' }), /find a game|finished/);
  // The run stays for the results page.
  assert.equal(w.data.get(`quizRuns/${runId}/players/learner`).score, 2850);
});

test('class-only quizzes keep guests out; the host can lock the room and remove a player', async () => {
  const w = world();
  const call = (who, d, now) => quizService(w.db, w.rtdb, who, d, now);
  const { runId, code } = await call(auth('teacher'), { action: 'host', source: { kind: 'class', classId: 'c1', itemId: 'i1', taskId: 't1' } }, 1000);
  await assert.rejects(call(null, { action: 'join', code, name: 'Guest' }), /class account/);
  const lina = await call(auth('learner', 'l_L1@learners.lesson-lit.firebaseapp.com'), { action: 'join', code });
  await call(auth('teacher'), { action: 'lock', runId, locked: true });
  assert.equal((await call(auth('learner', 'l_L1@learners.lesson-lit.firebaseapp.com'), { action: 'join', code })).pid, lina.pid, 'existing players can rejoin');
  w.data.set('users/other', { role: 'learner', displayName: 'Other' });
  w.data.set('classes/c1/members/other', { learnerId: 'L2', displayName: 'Other' });
  await assert.rejects(call(auth('other'), { action: 'join', code }), /closed.*new players/);
  await call(auth('teacher'), { action: 'kick', runId, pid: lina.pid });
  assert.equal(w.read(`quizLive/${runId}/players/${lina.pid}`), undefined);
  await call(auth('teacher'), { action: 'next', runId }, 5000);
  await assert.rejects(call(null, { action: 'answer', runId, pid: lina.pid, token: lina.token, slide: 0, responses: { q1: 0 } }, 9000), /not in this game/);
});

test('a saved quiz is hosted for anyone with the code, slides as the teacher made them', async () => {
  const w = world();
  w.data.set('sharedDocs/quiz1', { kind: 'game', owner: 'teacher', title: 'Food words' });
  w.data.set('sharedDocs/quiz1/game/main', { version: 2, slides: [
    { id: 's1', kind: 'choice', seconds: 10, points: 1, content: { type: 'doc', content: [{ type: 'mcq', attrs: { id: 'a', prompt: 'Bread is…', options: ['food', 'a drink'], correct: 0 } }] } },
    { id: 's2', kind: 'task', seconds: 60, points: 1, content: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'gap', attrs: { id: 'b', answers: ['eat'] } }] },
      { type: 'paragraph', content: [{ type: 'gap', attrs: { id: 'c', answers: ['drink'] } }] },
    ] } },
    { id: 's3', kind: 'poll', seconds: 20, points: 0, content: { type: 'doc', content: [{ type: 'mcq', attrs: { id: 'p', prompt: 'Favourite?', options: ['Tea', 'Coffee'], correct: -1 } }] } },
  ] });
  const { runId, code } = await quizService(w.db, w.rtdb, auth('teacher'), { action: 'host', source: { kind: 'doc', id: 'quiz1' } }, 1000);
  assert.equal(w.read(`quizLive/${runId}/total`), 3, 'two gaps on one slide stay one slide');
  assert.deepEqual(w.data.get(`quizRuns/${runId}`).kinds.at(-1), 'poll', 'a poll is known as a poll');
  await assert.rejects(quizService(w.db, w.rtdb, auth('learner'), { action: 'host', source: { kind: 'doc', id: 'quiz1' } }), /teacher|shared/);
  const g = await quizService(w.db, w.rtdb, null, { action: 'join', code, name: 'Kim' });
  await quizService(w.db, w.rtdb, auth('teacher'), { action: 'next', runId }, 2000);
  await quizService(w.db, w.rtdb, auth('teacher'), { action: 'close', runId }, 20000);
  await quizService(w.db, w.rtdb, auth('teacher'), { action: 'next', runId }, 21000);
  await quizService(w.db, w.rtdb, null, { action: 'answer', runId, pid: g.pid, token: g.token, slide: 1, responses: { b: 'eat', c: 'milk' } }, 24500);
  await quizService(w.db, w.rtdb, auth('teacher'), { action: 'close', runId }, 90000);
  assert.equal(w.read(`quizLive/${runId}/players/${g.pid}/s`), 500, 'half right, instantly: half of 1000');
  assert.equal(w.read(`quizLive/${runId}/players/${g.pid}/ok`), 0.5);
});

test('a game block inside a task: learners play at their own pace, answers sit with the task’s other answers', async () => {
  const w = world();
  const call = (who, d, now) => quizService(w.db, w.rtdb, who, d, now);
  const learner = auth('learner', 'l_L1@learners.lesson-lit.firebaseapp.com');
  const block = { type: 'gameBlock', attrs: { id: 'g1', title: 'Fruit game', settings: [{ seconds: 10, skin: 'moles' }, { seconds: 20 }], sizes: [1, 1] }, content: [
    { type: 'mcq', attrs: { id: 'b1', prompt: 'Which is a fruit?', options: ['Pear', 'Desk'], correct: 0 } },
    { type: 'paragraph', content: [{ type: 'text', text: 'I ' }, { type: 'gap', attrs: { id: 'b2', answers: ['am'] } }, { type: 'text', text: ' happy.' }] },
  ] };
  const { content, key } = splitKey({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read, then play.' }] }, { type: 'mcq', attrs: { id: 'other', prompt: 'Not in the game', options: ['a', 'b'], correct: 1 } }, block] });
  w.data.set('classes/c1/items/i1/tasks/t2', { title: 'Reading', content });
  w.data.set('classes/c1/items/i1/tasks/t2/private/key', key);
  // The learner already answered the task's own question.
  w.data.set('classes/c1/answers/t2_learner', { learnerUid: 'learner', taskId: 't2', responses: { other: 1 }, checked: true, score: 1, total: 1 });
  const { runId } = await call(auth('teacher'), { action: 'host', mode: 'self', source: { kind: 'block', classId: 'c1', itemId: 'i1', blockId: 'g1' } }, 1000);
  assert.equal(w.read(`quizLive/${runId}/phase`), 'self');
  assert.equal(w.data.get('classes/c1/live/state').games.g1.mode, 'self');
  assert.equal(w.data.get('classes/c1/live/state').liveQuiz, undefined, 'own-pace games show no live banner');
  await assert.rejects(call(auth('teacher'), { action: 'next', runId }), /move on by themselves/);
  const me = await call(learner, { action: 'join', runId }, 2000);
  const first = await call(null, { action: 'self-next', runId, pid: me.pid, token: me.token }, 3000);
  assert.equal(first.q.kind, 'choice');
  assert.equal(first.q.skin, 'moles');
  assert.ok(!JSON.stringify(first.q).includes('"correct"'), 'no answer before answering');
  const r1 = await call(null, { action: 'answer', runId, pid: me.pid, token: me.token, slide: 0, responses: { b1: 0 } }, first.startsAt + 2500);
  assert.equal(r1.frac, 1);
  assert.equal(r1.gained, 875, 'right after a quarter of the time');
  assert.deepEqual(r1.reveal.correct, [0], 'the answer comes back once answered');
  const again = await call(null, { action: 'self-next', runId, pid: me.pid, token: me.token }, 6000);
  assert.equal(again.answered, true, 'a refresh shows the same question, already answered');
  const second = await call(null, { action: 'self-next', runId, pid: me.pid, token: me.token, advance: true }, 7000);
  assert.equal(second.q.kind, 'task');
  const r2 = await call(null, { action: 'answer', runId, pid: me.pid, token: me.token, slide: 1, responses: { b2: 'am' } }, second.startsAt + 10000);
  assert.equal(r2.gained, 750 + 100, 'half time, plus a streak bonus');
  assert.equal(r2.last, true);
  const done = await call(null, { action: 'self-next', runId, pid: me.pid, token: me.token, advance: true }, 30000);
  assert.equal(done.done, true);
  const rec = w.data.get('classes/c1/answers/t2_learner');
  const game = w.data.get(`classes/c1/gameAttempts/${runId}_learner`);
  assert.deepEqual([game.responses.b1, game.responses.b2], [0, 'am'], 'game answers stay in this run');
  assert.deepEqual(rec.responses, { other: 1 }, 'ordinary task answers are untouched');
  assert.deepEqual([rec.checked, rec.score, rec.total], [true, 1, 1], 'the task’s own marking is untouched');
  assert.equal(game.points, 875 + 850);
  assert.equal(w.read(`quizLive/${runId}/players/learner/f`), 1);
});

test('own pace: a late answer scores nothing but the learner can carry on', async () => {
  const w = world();
  const call = (who, d, now) => quizService(w.db, w.rtdb, who, d, now);
  const { runId } = await call(auth('teacher'), { action: 'host', mode: 'self', guests: true, source: { kind: 'class', classId: 'c1', itemId: 'i1', taskId: 't1' } }, 1000);
  const g = await call(null, { action: 'join', runId, name: 'Kim' }, 2000);
  const q = await call(null, { action: 'self-next', runId, pid: g.pid, token: g.token }, 3000);
  const r = await call(null, { action: 'answer', runId, pid: g.pid, token: g.token, slide: 0, responses: { q1: 0 } }, q.endsAt + 10000);
  assert.equal(r.late, true);
  assert.equal(r.gained, 0);
  const next = await call(null, { action: 'self-next', runId, pid: g.pid, token: g.token, advance: true }, q.endsAt + 11000);
  assert.equal(next.q.index, 1);
});

test('two simultaneous closes and a retry after partial scoring award each player once', async () => {
  const w = world();
  const call = (who, d, now) => quizService(w.db, w.rtdb, who, d, now);
  const { runId, code } = await call(auth('teacher'), { action: 'host', guests: true, source: { kind: 'class', classId: 'c1', itemId: 'i1', taskId: 't1' } }, 1000);
  const lina = await call(auth('learner'), { action: 'join', code }, 2000);
  const sam = await call(null, { action: 'join', code, name: 'Sam' }, 2000);
  await call(auth('teacher'), { action: 'next', runId }, 3000);
  await call(null, { action: 'answer', runId, pid: lina.pid, token: lina.token, slide: 0, responses: { q1: 0 } }, 6500);
  await call(null, { action: 'answer', runId, pid: sam.pid, token: sam.token, slide: 0, responses: { q1: 0 } }, 6500);
  const original = w.db.runTransaction;
  let count = 0;
  w.db.runTransaction = (fn) => (++count === 3 ? Promise.reject(Error('interrupted scorer')) : original(fn));
  await assert.rejects(call(auth('teacher'), { action: 'close', runId }, 7000), /interrupted scorer/);
  assert.equal(w.data.get(`quizRuns/${runId}`).status, 'scoring');
  w.db.runTransaction = original;
  await Promise.all([call(auth('teacher'), { action: 'close', runId }, 7000), call(auth('teacher'), { action: 'close', runId }, 7000)]);
  assert.equal(w.data.get(`quizRuns/${runId}`).status, 'reveal');
  assert.equal(w.data.get(`quizRuns/${runId}/players/learner`).score, 1000);
  assert.equal(w.data.get(`quizRuns/${runId}/players/${sam.pid}`).score, 1000);
  assert.equal(w.data.get(`classes/c1/gameAttempts/${runId}_learner`).points, 1000);
});

test('own-pace answer retry completes a failed score write without awarding twice', async () => {
  const w = world();
  const call = (who, d, now) => quizService(w.db, w.rtdb, who, d, now);
  const { runId, code } = await call(auth('teacher'), { action: 'host', mode: 'self', source: { kind: 'class', classId: 'c1', itemId: 'i1', taskId: 't1' } }, 1000);
  const lina = await call(auth('learner'), { action: 'join', code }, 2000);
  const q = await call(null, { action: 'self-next', runId, pid: lina.pid, token: lina.token }, 3000);
  const answer = { action: 'answer', runId, pid: lina.pid, token: lina.token, slide: 0, responses: { q1: 0 } };
  const original = w.db.runTransaction;
  w.db.runTransaction = () => Promise.reject(Error('interrupted score'));
  await assert.rejects(call(null, answer, q.startsAt + 1000), /interrupted score/);
  assert.equal(w.data.get(`quizRuns/${runId}/answers/0_learner`).responses.q1, 0);
  w.db.runTransaction = original;
  const first = await call(null, answer, q.startsAt + 2000);
  const retry = await call(null, answer, q.endsAt + 10000);
  assert.equal(retry.score, first.score);
  assert.equal(w.data.get(`quizRuns/${runId}/players/learner`).score, first.score);
});

test('a replay keeps ordinary answers and the previous game attempt', async () => {
  const w = world();
  const call = (who, d, now) => quizService(w.db, w.rtdb, who, d, now);
  w.data.set('classes/c1/answers/t1_learner', { learnerUid: 'learner', taskId: 't1', responses: { q1: 2 }, checked: true, score: 0, total: 1 });
  const play = async (at) => {
    const { runId, code } = await call(auth('teacher'), { action: 'host', source: { kind: 'class', classId: 'c1', itemId: 'i1', taskId: 't1' } }, at);
    const lina = await call(auth('learner'), { action: 'join', code }, at + 1);
    await call(auth('teacher'), { action: 'next', runId }, at + 2);
    await call(null, { action: 'answer', runId, pid: lina.pid, token: lina.token, slide: 0, responses: { q1: 0 } }, at + 4000);
    await call(auth('teacher'), { action: 'close', runId }, at + 5000);
    return runId;
  };
  const first = await play(1000);
  const second = await play(10000);
  assert.notEqual(first, second);
  assert.equal(w.data.get('classes/c1/answers/t1_learner').responses.q1, 2);
  assert.equal(w.data.get(`classes/c1/gameAttempts/${first}_learner`).responses.q1, 0);
  assert.equal(w.data.get(`classes/c1/gameAttempts/${second}_learner`).responses.q1, 0);
});

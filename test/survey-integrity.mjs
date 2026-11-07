import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const fakes = {
  'firebase-functions/v2/https': `export class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } } export const onCall = (_opts, fn) => fn;`,
  'firebase-admin/firestore': `export const getFirestore = () => null; export const FieldValue = { serverTimestamp: () => 123 };`,
};
register('data:text/javascript,' + encodeURIComponent(`const f=${JSON.stringify(fakes)};export async function resolve(s,c,n){if(f[s])return{url:'data:text/javascript,'+encodeURIComponent(f[s]),shortCircuit:true};return n(s,c);}`));
const { saveAnonymousSurvey } = await import('../functions/learning/survey.js');

function store() {
  const docs = new Map([['classes/class1/members/learner1', { learnerId: 'L1' }]]);
  let nextId = 0;
  let lock = Promise.resolve();
  const ref = (path) => ({ path });
  return {
    docs,
    db: {
      doc: ref,
      collection: (path) => ({ doc: () => ref(`${path}/random${++nextId}`) }),
      runTransaction: (fn) => {
        const run = async () => {
          const writes = [];
          const tx = {
            get: async (r) => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
            create: (r, value) => writes.push([r.path, value]),
          };
          const result = await fn(tx);
          for (const [path, value] of writes) {
            if (docs.has(path)) throw Error('exists');
            docs.set(path, value);
          }
          return result;
        };
        const promise = lock.then(run);
        lock = promise.catch(() => {});
        return promise;
      },
    },
  };
}

test('simultaneous anonymous submissions count once and contain no identity', async () => {
  const { db, docs } = store();
  const input = { classId: 'class1', surveyId: 's1', answers: { q1: 2 } };
  const [a, b] = await Promise.all([saveAnonymousSurvey(db, 'learner1', input), saveAnonymousSurvey(db, 'learner1', input)]);
  assert.deepEqual([a.alreadyDone, b.alreadyDone].sort(), [false, true]);
  const responses = [...docs.entries()].filter(([path]) => path.includes('/surveyResponses/'));
  assert.equal(responses.length, 1);
  assert.equal(responses[0][1].answers.q1, 2);
  assert.equal(JSON.stringify(responses[0][1]).includes('learner1'), false);
  assert.equal(docs.has('classes/class1/surveyDone/s1_learner1'), true);
});

test('a user outside the class cannot submit', async () => {
  const { db, docs } = store();
  await assert.rejects(saveAnonymousSurvey(db, 'outsider', { classId: 'class1', surveyId: 's1', answers: { q1: 1 } }), /Join this class/);
  assert.equal([...docs.keys()].some((path) => path.includes('/surveyResponses/')), false);
});

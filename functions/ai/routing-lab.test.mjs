import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routingLab } from './routing-lab.js';

function fakeDb() {
  const documents = new Map();
  const ref = path => ({
    async get() { const value = documents.get(path); return { exists: !!value, get: key => key.split('.').reduce((v, part) => v?.[part], value) }; },
    async set(value, options) {
      const old = documents.get(path) || {};
      const merged = options?.merge ? { ...old, ...value, draft: { ...old.draft, ...value.draft } } : value;
      documents.set(path, merged);
    },
  });
  return { documents, doc: ref, async runTransaction(work) { return work({ get: target => target.get(), set: (target, value) => target.set(value) }); }, collection: name => ({
    async get() { return { docs: [...documents.entries()].filter(([path]) => path.startsWith(name + '/')).map(([path, value]) => ({ id: path.slice(name.length + 1), get: field => value[field] })) }; },
    async add(value) { documents.set(name + '/' + documents.size, value); },
  }) };
}
const admin = { uid: 'admin', token: { email: 'ardanurioglu@gmail.com', email_verified: true } };

test('keys start absent, are checked without generation, and never enter Firestore', async () => {
  const db = fakeDb();
  const status = await routingLab(db, admin, { action: 'status' });
  assert.deepEqual(status.credentials, {});
  assert.equal(status.jobs.tasks.live, 'openai:gpt-6.1-sol');
  let checked = 0, stored;
  const deps = {
    fetchImpl: async (url, init) => { assert.equal(url, 'https://api.deepseek.com/models'); assert.equal(init.headers.Authorization, 'Bearer deepseek-test-key'); checked++; return { ok: true }; },
    storeSecret: async (provider, value) => { stored = [provider, value]; },
  };
  await routingLab(db, admin, { action: 'connect', provider: 'deepseek', key: 'deepseek-test-key' }, deps);
  assert.deepEqual(stored, ['deepseek', 'deepseek-test-key']);
  assert.equal(checked, 1);
  assert.equal(JSON.stringify([...db.documents.values()]).includes('deepseek-test-key'), false);
  const after = await routingLab(db, admin, { action: 'status' });
  assert.equal(after.credentials.deepseek.connected, true);
  assert.equal(after.jobs.tasks.live, 'openai:gpt-6.1-sol');
});

test('failed key and unsigned or proxy accounts cannot change the lab', async () => {
  const db = fakeDb();
  const blocked = { ...admin, token: { ...admin.token, proxyBy: 'real-user' } };
  await assert.rejects(routingLab(db, null, { action: 'status' }), /Sign in to use/);
  await assert.rejects(routingLab(db, blocked, { action: 'status' }), /verified super admins/);
  await assert.rejects(routingLab(db, admin, { action: 'saveDraft', job: 'tasks', candidate: 'deepseek:deepseek-flash' }), /Connect and check/);
  await assert.rejects(routingLab(db, admin, { action: 'connect', provider: 'deepseek', key: 'not-valid-enough' }, {
    fetchImpl: async () => ({ ok: false, status: 401 }), storeSecret: () => { throw Error('must not store'); },
  }), /rejected this key/);
  assert.equal(db.documents.size, 0);
});

test('draft choices remain separate from live routes', async () => {
  const db = fakeDb();
  await db.doc('aiRoutingLabCredentials/deepseek').set({ connected: true });
  await routingLab(db, admin, { action: 'saveDraft', job: 'tasks', candidate: 'deepseek:deepseek-v4-pro' });
  const status = await routingLab(db, admin, { action: 'status' });
  assert.equal(status.draft.tasks, 'deepseek:deepseek-v4-pro');
  assert.equal(status.jobs.tasks.live, 'openai:gpt-6.1-sol');
  await assert.rejects(routingLab(db, admin, { action: 'saveDraft', job: 'tasks', candidate: 'elevenlabs:music' }), /Choose a candidate/);
});

test('one task comparison runs three fixed, structured trials and returns estimated costs', async () => {
  const db = fakeDb();
  await db.doc('aiRoutingLabCredentials/deepseek').set({ connected: true });
  const calls = [];
  const fixture = { title: 'Plan a trip', learnerInstructions: 'Talk to your partner.', questions: ['When?', 'Where?', 'How?', 'Why?'], answerKey: ['Saturday', 'York', 'Train', 'A day out'], teacherNotes: 'Pair learners and check the answers.' };
  const deps = {
    openaiKey: 'openai-test-key', readSecret: async () => 'deepseek-test-key',
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body); calls.push({ url, model: body.model, key: init.headers.Authorization, prompt: body.input });
      return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(fixture) }] }], usage: { input_tokens: 500, output_tokens: 300 } }) };
    },
  };
  const result = await routingLab(db, admin, { action: 'trialTasks' }, deps);
  assert.equal(result.results.length, 3);
  assert.deepEqual(calls.map(call => call.model), ['gpt-6.1-sol', 'deepseek-v4-pro', 'deepseek-flash']);
  assert.equal(calls.every(call => call.prompt === calls[0].prompt), true);
  assert.equal(result.results[0].maximumListCostUsd, 0.004);
  assert.equal(result.results[1].maximumListCostUsd, 0.00185);
  assert.equal(JSON.stringify([...db.documents.values()]).includes('deepseek-test-key'), false);
});

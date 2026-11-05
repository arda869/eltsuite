import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/responseSaveQueue.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { ResponseSaveQueue } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
globalThis.window = globalThis;
const connection = { onLine: true };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: connection });
const storage = () => {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
const base = taskId => ({ learnerUid: 'u', learnerId: 'l', itemId: 'lesson', taskId });

test('rapid task switching keeps independent saves and the latest same-task revision', async () => {
  const pending = [];
  const store = storage();
  const queue = new ResponseSaveQueue('class:lesson:u', (b, responses) => new Promise(resolve => pending.push({ id: b.taskId, responses, resolve })), () => {}, store);
  queue.update(base('a'), { q: 'first' });
  queue.update(base('b'), { q: 'second' });
  const a = queue.flush('a'), b = queue.flush('b');
  assert.equal(pending.length, 2);
  queue.update(base('a'), { q: 'final' });
  pending.find(p => p.id === 'b').resolve();
  pending.find(p => p.id === 'a').resolve();
  assert.equal(await b, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(pending.length, 3);
  assert.deepEqual(pending[2].responses, { q: 'final' });
  pending[2].resolve();
  assert.equal(await a, true);
  assert.equal(queue.status('a'), 'saved');
  assert.equal(store.data.size, 0);
  queue.dispose();
});

test('failed and offline saves keep a local draft until retry succeeds', async () => {
  const store = storage();
  let fail = true;
  const saved = [];
  const queue = new ResponseSaveQueue('class:lesson:u', async (b, responses) => { if (fail) throw Error('disconnected'); saved.push([b.taskId, responses]); }, () => {}, store);
  queue.update(base('a'), { q: 'answer' });
  assert.equal(await queue.flush('a'), false);
  assert.equal(queue.status('a'), 'error');
  assert.equal(store.data.size, 1);
  connection.onLine = false;
  assert.equal(await queue.flush('a'), false);
  assert.equal(queue.status('a'), 'waiting');
  fail = false;
  connection.onLine = true;
  queue.reconnect();
  assert.equal(await queue.flush('a'), true);
  assert.deepEqual(saved, [['a', { q: 'answer' }]]);
  assert.equal(store.data.size, 0);
  queue.dispose();
});

test('reload restores an unsaved activity without losing another task', async () => {
  const store = storage();
  const first = new ResponseSaveQueue('class:lesson:u', async () => {}, () => {}, store);
  first.update(base('a'), { q: 'draft A' });
  first.update(base('b'), { q: 'draft B' });
  first.dispose();
  connection.onLine = false;
  const second = new ResponseSaveQueue('class:lesson:u', async () => {}, () => {}, store);
  assert.deepEqual(second.draft('a', base('a')), { q: 'draft A' });
  assert.deepEqual(second.draft('b', base('b')), { q: 'draft B' });
  assert.equal(second.status('a'), 'unsaved');
  second.dispose();
  connection.onLine = true;
});

test('a development effect cleanup and restart still autosaves edits', async () => {
  const saved=[];
  const queue=new ResponseSaveQueue('class:lesson:u',async (_base,responses)=>{saved.push(responses);},()=>{},storage());
  queue.activate();
  queue.dispose();
  queue.activate();
  queue.update(base('a'),{q:'after restart'});
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.deepEqual(saved,[{q:'after restart'}]);
  assert.equal(queue.status('a'),'saved');
  queue.dispose();
});

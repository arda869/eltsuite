import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';

const built = await build({ entryPoints: ['src/lib/suiteScriptApply.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false });
const file = new URL('./.suite-script-apply-test-bundle.mjs', import.meta.url);
await writeFile(file, built.outputFiles[0].text);
const { projectSuiteScriptClassTask, selectedSuiteScriptTaskPatch } = await import(file.href);
await unlink(file);

test('whole class task stores answers and teacher notes privately while carrying print and task settings', async () => {
  const row = await projectSuiteScriptClassTask({
    title: 'Welcome', kind: 'task', layout: 'two', hidden: true, locked: true, colScroll: 'together',
    paper: { gap: 'medium', lines: 3, show: 'both', icon: 'none' }, anchor: 'welcome',
    identity: { id: 'opening', name: 'Activation', colour: '#a74d37', icon: 'spark' },
    instructions: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ask.' }] }] },
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'choice', attrs: { id: 'question1', display: 'radio', options: ['A', 'B'], correct: 1 } }] }] },
    notes: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'SECRET LEAD IN' }] }] },
    paperInstructions: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write it.' }] }] },
  }, 'sample-class');
  assert.equal(row.publicTask.print.gap, 'medium');
  assert.equal(row.publicTask.print.instr, 'Write it.');
  assert.equal(row.publicTask.hidden, true);
  assert.equal(row.publicTask.anchor, 'welcome');
  assert.equal(row.publicTask.identity.name, 'Activation');
  assert.equal(Object.values(row.key)[0].correct, 1);
  assert.doesNotMatch(JSON.stringify(row.publicTask), /SECRET LEAD IN|"correct":1/);
  assert.match(JSON.stringify(row.notes), /SECRET LEAD IN/);
});

test('selected learner A task patch keeps routing and identity; learner B is untouched', () => {
  const originalA = { title: 'A', family: 'pair', variant: 'A', audience: { mode: 'assigned' }, allowed: ['learner-a'], identity: { id: 'keep' } };
  const originalB = { title: 'B', family: 'pair', variant: 'B', content: { type: 'doc', content: [{ type: 'paragraph' }] } };
  const patch = selectedSuiteScriptTaskPatch(originalA, { title: 'Revised A', content: { type: 'doc', content: [{ type: 'paragraph' }] }, identity: { id: 'other' }, family: 'wrong', variant: 'B' });
  const revisedA = { ...originalA, ...patch };
  assert.equal(revisedA.title, 'Revised A');
  assert.equal(revisedA.family, 'pair');
  assert.equal(revisedA.variant, 'A');
  assert.deepEqual(revisedA.identity, { id: 'keep' });
  assert.deepEqual(revisedA.allowed, ['learner-a']);
  assert.deepEqual(originalB, { title: 'B', family: 'pair', variant: 'B', content: { type: 'doc', content: [{ type: 'paragraph' }] } });
});

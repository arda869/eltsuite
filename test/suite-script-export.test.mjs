import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';

const built = await build({ entryPoints: ['src/lib/suiteScriptExport.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false });
const file = new URL('./.suite-script-export-test-bundle.mjs', import.meta.url);
await writeFile(file, built.outputFiles[0].text);
const { classTaskToSuiteScriptDraft, selectSuiteScriptClassVersions } = await import(file.href);
await unlink(file);

test('Class export of selected version carries metadata and restores teacher-only answer', () => {
  const raw = { id: 'A', title: 'Interview', kind: 'task', instructions: 'Ask.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'choice', attrs: { id: 'q', display: 'radio', options: ['Yes', 'No'], correct: -1 } }] }] },
    order: 0, hidden: false, locked: true, family: 'pair', variant: 'A', print: { gap: 'short', instr: 'Circle one.' }, identity: { id: 'opener', name: 'Activation', colour: '#984e3b', icon: 'check' } };
  const draft = classTaskToSuiteScriptDraft(raw, { q: { kind: 'mcq', correct: 1 } }, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Private note' }] }] });
  assert.equal(draft.kind, 'task');
  assert.equal(draft.content[0].content[0].attrs.correct, 1);
  assert.equal(draft.teacherNotes[0].content[0].text, 'Private note');
  assert.equal(draft.paper.gap, 'short');
  assert.equal(draft.paperInstructions[0].content[0].text, 'Circle one.');
  assert.equal(draft.identity.name, 'Activation');
  assert.equal('variant' in draft, false);
  assert.equal('family' in draft, false);
});

test('whole-activity export requires one selected learner version from each family', () => {
  const tasks = [{ id: 'a', order: 0, variants: ['b'] }, { id: 'b', order: 1, family: 'a', variant: 'B' }, { id: 'c', order: 2 }];
  assert.throws(() => selectSuiteScriptClassVersions(tasks), /Export each learner version separately/);
  assert.deepEqual(selectSuiteScriptClassVersions(tasks, ['b', 'c']).map(task => task.id), ['b', 'c']);
  assert.deepEqual(selectSuiteScriptClassVersions(tasks, ['a', 'c']).map(task => task.id), ['a', 'c']);
});

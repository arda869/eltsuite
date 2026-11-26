import test from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { parseSuiteScript, toSuiteScript, suiteScriptMessageSafe, SUITE_SCRIPT_MAX_CHARS } from '../src/lib/suiteScript.ts';
import { suiteScriptChecksum, suiteScriptId, validSuiteScriptId } from '../functions/suitescript/id.js';

const bundled = await build({ entryPoints: ['src/lib/suiteScriptDraft.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false });
const testBundle = new URL('./.suite-script-draft-test-bundle.mjs', import.meta.url);
await writeFile(testBundle, bundled.outputFiles[0].text);
const { createSuiteScriptDraft } = await import(testBundle.href);
await unlink(testBundle);

const labels = { gap: 'Gap fill', 'choice:radio': 'Multiple choice, as a list', 'choice:dropdown': 'Multiple choice in line' };
const fixture = `SuiteScript v1
@heading("At reception")

Listen for the @bold("room number"). Then compare your answer with a partner.

@question(
  type: "Multiple choice, as a list",
  prompt: "Which room is ready now?",
  options: ["Room 14", "Room 40", "Neither room"],
  teacherOnly: { answer: "Room 40" }
)

@heading("Check what you heard")

Say @stress("four", "teen", stressed: 2) and @stress("for", "ty", stressed: 1).

@numbered(
  "Choose what matters most.",
  "Discuss both rooms.",
  "Agree on a room."
)`;

test('Friday fixture parses prose, marks, native question, private answer and one-based stress', () => {
  const parsed = parseSuiteScript(fixture, labels);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.content[0].type, 'heading');
  const sentence = parsed.content.find(node => node.content?.some(child => child.marks?.some(mark => mark.type === 'bold')));
  assert.equal(sentence.content.find(child => child.marks?.some(mark => mark.type === 'bold')).text, 'room number');
  const question = parsed.content.flatMap(node => node.content ?? []).find(node => node.type === 'choice');
  assert.equal(question.attrs.options[1], 'Room 40');
  assert.equal(question.attrs.correct, 1);
  const stress = parsed.content.flatMap(node => node.content ?? []).filter(node => node.type === 'stress');
  assert.deepEqual(stress.map(node => node.attrs.stressed), [1, 0]);
  assert.equal(parsed.content.at(-1).type, 'orderedList');
  assert.equal(parsed.content.at(-1).content.length, 3);
});

test('plain-text intermediary round-trips rich marks, answers and Unicode; ordinary notation remains literal', () => {
  const original = [
    { type: 'paragraph', content: [
      { type: 'text', text: '你好 **literal** #1 | IPA /ə/ @mentor ' },
      { type: 'text', text: 'room number', marks: [{ type: 'bold' }] },
      { type: 'choice', attrs: { id: 'original', display: 'radio', options: ['Paris', 'Rome'], correct: 1 } },
    ] },
    { type: 'paragraph', content: [{ type: 'stress', attrs: { syllables: ['for', 'ty'], stressed: 0, style: 'box' } }] },
  ];
  const plain = toSuiteScript(original, labels);
  assert.match(plain, /^SuiteScript v1\n/);
  assert.match(plain, /@@mentor/);
  const cloned = String(plain); // no HTML clipboard data
  const parsed = parseSuiteScript(cloned, labels);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.content, original);
});

test('malformed commands and invalid stress leave no partial parsed content', () => {
  const wrong = parseSuiteScript('SuiteScript v1\nFine text.\n@stress("for", "ty", stressed: 3)', labels);
  assert.equal(wrong.content.length, 0);
  assert.match(wrong.errors[0], /Line 3/);
  assert.equal(parseSuiteScript('Plain text @bold("word")', labels).content.length, 0);
});

test('unknown @ notation and teaching symbols stay literal; hostile and oversized drafts do not execute', () => {
  globalThis.__suiteScriptRan = false;
  const unknown = parseSuiteScript('SuiteScript v1\n@mentor(John) **bold** #tag [x] | /ʃ/ @@bold("visible")', labels);
  assert.deepEqual(unknown.errors, []);
  assert.equal(unknown.content[0].content[0].text, '@mentor(John) **bold** #tag [x] | /ʃ/ @bold("visible")');
  const hostile = parseSuiteScript('SuiteScript v1\n@element(data: { type: "paragraph", content: [{ type: "text", text: "<script>globalThis.__suiteScriptRan=true</script>" }] })', labels);
  assert.deepEqual(hostile.errors, []);
  assert.equal(globalThis.__suiteScriptRan, false);
  assert.equal(parseSuiteScript('SuiteScript v1\n' + 'x'.repeat(SUITE_SCRIPT_MAX_CHARS), labels).content.length, 0);
});

test('learner-visible message projection removes private keys and opaque content', () => {
  const parsed = parseSuiteScript(fixture, labels);
  const safe = suiteScriptMessageSafe(parsed.content);
  assert.doesNotMatch(JSON.stringify(safe), /correct|teacherOnly|Room 40.*correct/);
  assert.match(JSON.stringify(safe), /Room 14 \/ Room 40/);
  const opaque = suiteScriptMessageSafe([{ type: 'teacherNote', content: [{ type: 'text', text: 'PRIVATE ANSWER' }] }]);
  assert.doesNotMatch(JSON.stringify(opaque), /PRIVATE ANSWER/);
});

test('12 digit checksum detects single digit and adjacent swaps, preserving leading zeroes', () => {
  const id = suiteScriptId('000100020003');
  assert.equal(id, `ELTSUITE-0001-0002-0003-${suiteScriptChecksum('000100020003')}`);
  assert.equal(validSuiteScriptId(id), true);
  assert.equal(validSuiteScriptId(id.replace('0002', '0003')), false);
  assert.equal(validSuiteScriptId(id.replace('0002', '0020')), false);
});

test('scoped SuiteScript draft validates preview and applies atomically only to its original version', () => {
  const schema = new Schema({
    nodes: { doc: { content: 'block+' }, paragraph: { group: 'block', content: 'inline*' }, text: { group: 'inline' } },
    marks: { bold: {}, italic: {}, underline: {}, strike: {} },
  });
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }] }) });
  const editor = { schema, get state() { return state; }, getJSON: () => state.doc.toJSON(), view: { dispatch(tr) { state = state.apply(tr); } } };
  const draft = createSuiteScriptDraft(editor, {}, 'field');
  assert.deepEqual(draft.preview('SuiteScript v1\nNew @bold("text")').errors, []);
  const applied = draft.apply('SuiteScript v1\nNew @bold("text")');
  assert.equal(applied.applied, true, applied.errors.join('; '));
  assert.equal(state.doc.textContent, 'New text');
  assert.equal(draft.apply('SuiteScript v1\nOverwritten').applied, false);
  assert.equal(state.doc.textContent, 'New text');
});

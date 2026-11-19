import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const out = `/tmp/resource-hub-answer-key-${process.pid}.mjs`;
await build({ entryPoints: ['src/resourceHub/hubAnswerKey.ts'], outfile: out, bundle: true, platform: 'node', format: 'esm' });
const { generatedAnswerLines, withGeneratedAnswerKey } = await import(pathToFileURL(out));
const sections = [
  { id: 'learner', title: 'Practice A', audience: 'learner', kind: 'task', instructions: '', content: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'I have ' }, { type: 'gap', attrs: { id: 'q1', answers: ['been'] } }] },
    { type: 'paragraph', content: [{ type: 'choice', attrs: { id: 'q2', options: ['walk', 'walked'], correct: 1, multi: false } }] },
  ] } },
  { id: 'key', title: 'Answer key', audience: 'teacher', kind: 'answer-key', instructions: '', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Suggested response: I have been to Japan.' }] }] } },
];
assert.deepEqual(generatedAnswerLines(sections), ['Practice A', '1. been', '2. walked']);
const once = withGeneratedAnswerKey(sections);
assert.deepEqual(withGeneratedAnswerKey(once), once, 'regenerating must not duplicate generated lines');
assert.equal(once.find(section => section.id === 'key').content.content.at(-1).content[0].text, 'Suggested response: I have been to Japan.', 'manual guidance must remain');
assert.equal(sections[0].content.content[0].content[1].attrs.answers[0], 'been', 'learner authoring content remains unchanged');
const { splitKey } = await (async () => {
  const file = `/tmp/resource-hub-split-key-${process.pid}.mjs`;
  await build({ entryPoints: ['src/lib/questions.ts'], outfile: file, bundle: true, platform: 'node', format: 'esm' });
  return import(pathToFileURL(file));
})();
const copied = splitKey(structuredClone(once[0].content));
assert.deepEqual(copied.key.q1.answers, ['been']);
assert.equal(copied.key.q2.correct, 1);
assert.equal(copied.content.content[0].content[1].attrs.answers.length, 0, 'learner Class copy must not contain the gap key');
assert.equal(copied.content.content[1].content[0].attrs.correct, -1, 'learner Class copy must not contain the choice key');
assert.equal(JSON.stringify(copied.content).includes('Suggested response'), false, 'teacher guidance must not enter learner content');
console.log('PASS Resource Hub generated key is idempotent, preserves manual guidance, and Class split hides answers.');

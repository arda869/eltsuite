import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const out = `/tmp/resource-hub-answer-key-${process.pid}.mjs`;
await build({ entryPoints: ['src/resourceHub/hubAnswerKey.ts'], outfile: out, bundle: true, platform: 'node', format: 'esm' });
const { generatedAnswerLines, generatedAnswerLinesForSection, withGeneratedAnswerKey } = await import(pathToFileURL(out));
const sections = [
  { id: 'learner', title: 'Practice A', audience: 'learner', kind: 'task', instructions: '', content: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'I have ' }, { type: 'gap', attrs: { id: 'q1', answers: ['been'] } }] },
    { type: 'paragraph', content: [{ type: 'choice', attrs: { id: 'q2', options: ['walk', 'walked'], correct: 1, multi: false } }] },
  ] } },
  { id: 'key', title: 'Answer key', audience: 'teacher', kind: 'answer-key', instructions: '', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Suggested response: I have been to Japan.' }] }] } },
];
assert.deepEqual(generatedAnswerLines(sections), ['Practice A', '1. been', '2. walked']);
assert.deepEqual(generatedAnswerLinesForSection(sections[0]), ['1. been', '2. walked']);
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
const tasksFile = `/tmp/resource-hub-class-tasks-${process.pid}.cjs`;
await build({ entryPoints: ['src/resourceHub/resourceTasks.ts'], outfile: tasksFile, bundle: true, platform: 'node', format: 'cjs' });
const { publishedTasks, resourceTasks } = await import(pathToFileURL(tasksFile));
const selectedPractice = resourceTasks(new Set(['practice-a']));
assert.equal(selectedPractice.length, 2, 'copying one built-in practice includes its teacher guidance');
assert.equal(selectedPractice[0].hidden, true, 'standalone built-in lead-in stays private');
assert.match(selectedPractice[0].notes, /Lead-in · 5 minutes/);
assert.equal(selectedPractice[1].hidden, false);
assert.match(selectedPractice[1].notes, /Practice A:/, 'the selected practice retains its answer notes');
const imported = publishedTasks({ editorSections: [
  { id: 'lead', title: 'Lead-in', audience: 'teacher', kind: 'notes', instructions: 'Introduce the topic.', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tell a short story.' }] }] } },
  ...once,
] }, new Set(['learner']));
assert.equal(imported.length, 3, 'standalone lead-in and manual key remain distinct from learner task');
assert.equal(imported[0].hidden, true, 'standalone teacher guidance is hidden from learners');
assert.equal(imported[0].instructions, '', 'teacher-only wording stays in the private notes document');
assert.match(imported[0].notes, /Introduce the topic[\s\S]*Tell a short story/);
assert.equal(imported[1].hidden, true, 'manual suggested answer remains private');
assert.match(imported[1].notes, /Suggested response/);
assert.equal(imported[2].hidden, false);
assert.equal(imported[2].notes, undefined, 'generated key lives with its task, not as duplicate notes');
assert.equal(JSON.stringify(imported[2].content).includes('Tell a short story'), false);
console.log('PASS Resource Hub generated key is idempotent, preserves manual guidance, and Class split hides answers.');

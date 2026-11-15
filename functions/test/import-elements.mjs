import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { IMPORT_TYPES, newImportElement } from '../ai/import-types.js';
import { nativeImportedElements } from '../ai/import-elements.js';
import { checkImportElements } from '../ai/import-validation.js';

// Every element a teacher can add by hand in the task editor, and the import kind (or import
// field) that makes it. Keep this in step with COMMANDS in src/editor/TaskEditor.tsx.
// Not importable on purpose: a PDF, a game, a storyboard, a column break, recordings and videos
// (an import never invents media) and items from the teacher's own question bank.
const EDITOR_TO_IMPORT = {
  gap: 'gap', lettergap: 'lettergap', wordform: 'wordform', radio: 'radio', dropdown: 'dropdown', truefalse: 'truefalse',
  notgiven: 'notgiven', match: 'match', drop: 'drop', order: 'order', writing: 'writing', reflect: 'reflect', peer: 'peer',
  upload: 'upload', board: 'board', postits: 'postits', drawboard: 'drawboard', collab: 'collab', survey: 'survey',
  drawcard: 'drawcard', wheel: 'wheel', boxes: 'boxes', speaking: 'speaking', dialogue: 'dialogue', textbox: 'boxedText',
  info: 'boxedText', heading: 'heading', list: 'list', numbered: 'list', quote: 'quote', reveal: 'reveal', table: 'table',
  ipa: 'ipa', stress: 'stress', subst: 'subst', phonchart: 'phonchart', phoncard: 'phoncard', phonhow: 'phoncard',
  dictcut: 'dictcut', linkcard: 'linkcard', image: 'picture',
  'pq-fix': 'pq-fix', 'pq-categorise': 'pq-categorise', 'pq-transform': 'pq-transform', 'pq-highlight': 'pq-highlight',
  'pq-sentences': 'pq-sentences', 'pq-label': 'pq-label', 'pq-odd': 'pq-odd', 'pq-gapped': 'pq-gapped',
  'pq-matching': 'pq-matching', 'pq-speaking': 'pq-speaking', 'pq-dictation': 'pq-dictation', 'pq-pairs': 'pq-pairs',
  'pq-crossword': 'pq-crossword', 'pq-wordsearch': 'pq-wordsearch',
  corpus: 'investigation', discourse: 'investigation', 'language-awareness': 'investigation', pragmatics: 'investigation',
  'learner-development': 'investigation', research: 'investigation',
  'tt-analysis': 'tt-analysis', 'tt-plan': 'tt-plan', 'tt-loop': 'tt-loop', 'tt-rehearsal': 'tt-rehearsal', 'tt-exam': 'tt-exam',
  'tt-reflection': 'tt-reflection',
};

test('every editor element maps to an import kind that exists', () => {
  const kinds = new Set(IMPORT_TYPES.map((t) => t.kind));
  for (const [editor, kind] of Object.entries(EDITOR_TO_IMPORT)) assert.ok(kinds.has(kind), `${editor} → ${kind} is not an import kind`);
});

test('every import kind becomes editor content', () => {
  for (const t of IMPORT_TYPES) {
    if (t.kind.startsWith('tt-')) continue;
    const e = newImportElement(t.kind, ['gap', 'lettergap', 'wordform', 'drop', 'dropdown', 'subst'].includes(t.kind) ? 'Before ___ after.' : 'Prompt.');
    assert.doesNotThrow(() => nativeImportedElements([e], 'test'), t.kind);
  }
});

test('a table with gaps keeps its answers in the key', () => {
  const e = newImportElement('table');
  e.data = { headers: ['Verb', 'Past'], rows: [['go', '___'], ['see', '___']], answers: ['went', 'saw'] };
  checkImportElements([e], false);
  const r = nativeImportedElements([e], 't');
  assert.deepEqual(Object.values(r.key).map((k) => k.answers[0]), ['went', 'saw']);
  assert.ok(!JSON.stringify(r.content).includes('went'), 'answers must not reach learners');
});

test('a listening worksheet without a key keeps its questions and flags review', () => {
  const gap = newImportElement('gap', 'The train leaves at ___.');
  gap.needs = ['recording'];
  const choice = newImportElement('radio', 'Where does the train stop?');
  choice.data = { options: ['London', 'York', 'Leeds'], answer: '' };
  choice.needs = ['recording'];
  const required = checkImportElements([gap, choice], false);
  const result = nativeImportedElements([gap, choice], 'listening');
  assert.ok(required.some(x => x.includes('missing answer key')));
  assert.ok(required.some(x => x.includes('original recording')));
  assert.deepEqual(result.key.listening_e0.answers, []);
  assert.equal(result.key.listening_e1.correct, -1);
  assert.ok(JSON.stringify(result.content).includes('Where does the train stop?'));
});

test('a supplied answer key remains private and does not trigger a missing-key warning', () => {
  const gap = newImportElement('gap', 'The train leaves at ___.');
  gap.data.answers = ['nine'];
  const required = checkImportElements([gap], false);
  const result = nativeImportedElements([gap], 'keyed');
  assert.ok(!required.some(x => x.includes('missing answer key')));
  assert.deepEqual(result.key.keyed_e0.answers, ['nine']);
  assert.ok(!JSON.stringify(result.content).includes('nine'));
});

test('unknown listening answers survive validation without becoming guessed keys', () => {
  const drop = newImportElement('drop', 'The booking is for ___.');
  drop.data.answer = '';
  drop.needs = ['recording'];
  const table = newImportElement('table');
  table.data = { headers: ['Item', 'Price'], rows: [['Tea', '___'], ['Cake', '___']], answers: [] };
  table.needs = ['recording'];
  const dialogue = newImportElement('dialogue');
  dialogue.data = { layout: 'stacked', turns: [{ speaker: 'Guest', text: 'I would like ___, please.', answers: [] }, { speaker: 'Server', text: 'Of course.', answers: [] }] };
  dialogue.needs = ['recording'];
  const match = newImportElement('match', 'Match each person to a room.');
  match.data = { pairs: [{ left: 'Alice', right: '' }, { left: 'Ben', right: '' }], extras: ['Room A', 'Room B'] };
  match.needs = ['recording'];
  const statements = newImportElement('pq-matching');
  statements.data = { options: ['A', 'B'], names: [], statements: [{ text: 'The guest orders tea.', answer: -1 }] };
  statements.needs = ['recording'];
  const elements = [drop, table, dialogue, match, statements];
  const required = checkImportElements(elements, false);
  assert.ok(required.some(x => x.includes('missing answer key')));
  assert.ok(required.some(x => x.includes('original recording')));
  const result = nativeImportedElements(elements, 'unknown');
  assert.equal(result.key.unknown_e0.answer, '');
  assert.deepEqual([result.key.unknown_e1_cell0.answers, result.key.unknown_e1_cell1.answers], [[], []]);
  assert.deepEqual(result.key.unknown_e2_gap0_0.answers, []);
  assert.deepEqual(result.key.unknown_e3.map, [-1, -1]);
  assert.deepEqual(result.key.unknown_e4.k.map, [-1]);
  const matchNode = result.content.find(node => node.type === 'match');
  assert.deepEqual(new Set(matchNode.attrs.right), new Set(['Room A', 'Room B']));
  assert.ok(!JSON.stringify(result.content).includes('answer:'));
});

test('a separate worksheet and answer-key file stay labelled and within import limits', async () => {
  const built = await build({ entryPoints: [new URL('../../src/materials/combineSource.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false });
  const { combineMaterialSources } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  const worksheet = { name: 'Listening.pdf', text: 'What did the guest order?', images: ['data:image/jpeg;base64,/9j/'], imageLabels: ['PDF page 1'], warnings: [] };
  const key = { name: 'Key.pdf', text: '1. Tea', images: ['data:image/jpeg;base64,/9j/'], imageLabels: ['PDF page 2'], warnings: [] };
  const joined = combineMaterialSources(worksheet, key);
  assert.equal(joined.name, 'Listening.pdf');
  assert.match(joined.text, /\[Answer key: Key.pdf\][\s\S]*1\. Tea/);
  assert.deepEqual(joined.imageLabels, ['PDF page 1', 'Answer key · Key.pdf · PDF page 2']);
  assert.deepEqual(joined.images, [worksheet.images[0], key.images[0]]);
  assert.equal(joined.answerKeyImageStart, 1, 'worksheet image indices remain before key pages');
  assert.throws(() => combineMaterialSources({ ...worksheet, images: Array(6).fill(worksheet.images[0]) }, key), /six pages/);
});

test('new element checks', () => {
  const table = newImportElement('table');
  table.data = { headers: ['A'], rows: [['___'], ['___']], answers: ['one'] };
  assert.throws(() => checkImportElements([table], false));
  const link = newImportElement('linkcard');
  link.data = { url: 'http://example.com', title: 'x', note: '' };
  assert.throws(() => checkImportElements([link], false));
  const stress = newImportElement('stress');
  stress.data = { syllables: ['to', 'day'], stressed: 3 };
  assert.throws(() => checkImportElements([stress], false));
});

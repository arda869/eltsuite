import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { IMPORT_TYPES, newImportElement } from '../ai/import-types.js';
import { nativeImportedElements } from '../ai/import-elements.js';
import { checkImportElements } from '../ai/import-validation.js';
import { checkImportPictures, resolveImportPictures, taskPictureIds } from '../ai/import-pictures.js';
import { nativeTask } from '../ai/activities.js';
import { importTask } from '../../test/ai/import-types-fixture.mjs';

// Every element a teacher can add by hand in the task editor, and the import kind (or import
// field) that makes it. Keep this in step with COMMANDS in src/editor/TaskEditor.tsx.
// Not importable on purpose: a PDF, a column break, recordings and videos
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
  ...Object.fromEntries(['board','bingo','dominoes','memory','strips','cue','survey','findSomeone','ranking','opinion','spot','taboo','speaking'].map(kind=>['communicative-'+kind,'ca-'+kind])),
};

test('every editor element maps to an import kind that exists', () => {
  const kinds = new Set(IMPORT_TYPES.map((t) => t.kind));
  for (const [editor, kind] of Object.entries(EDITOR_TO_IMPORT)) assert.ok(kinds.has(kind), `${editor} → ${kind} is not an import kind`);
});

test('AI import and Create with AI convert every communicative kind into editable native cards', () => {
  const kinds=['board','bingo','dominoes','memory','strips','cue','survey','findSomeone','ranking','opinion','spot','taboo','speaking'];
  for(const kind of kinds){
    const element=newImportElement('ca-'+kind,'');
    element.data.instruction='';
    element.data.cards=element.data.cards.map((card,n)=>({
      ...card,title:`Card ${n+1}`,text:`Talk about card ${n+1}.`,
      ...('match'in card?{match:`Pair ${n+1}`}:{}),
      ...('options'in card?{options:['Yes','No']}:{}),
    }));
    if(kind==='spot'){
      element.data.cards.forEach((card,n)=>{card.picture=`https://example.com/picture-${n}.png`;card.alt=`Picture ${n+1}`;});
      element.data.differences=[{x:30,y:40,radius:5,label:'Changed object'}];
    }
    assert.doesNotThrow(()=>checkImportElements([element],false),kind);
    const result=nativeImportedElements([element],'ca');
    const activity=Object.values(result.activities)[0];
    assert.ok(activity,kind);
    assert.equal(result.content[0].attrs.sealed,true,'learner content is a sealed placeholder');
    assert.equal(activity.attrs.kind,kind);
    assert.equal(activity.attrs.instruction,'');
    assert.equal(activity.content.length,element.data.cards.length);
    assert.ok(activity.content.every(card=>card.type==='pickCard'&&card.attrs.activityItemId));
    const task=nativeTask(importTask([element]),0,'roundtrip');
    assert.equal(Object.values(task.activities)[0].attrs.kind,kind,'private card content survives full task creation');
    assert.equal(task.content.content.find(node=>node.type==='communicativeActivity')?.attrs.sealed,true);
  }
});

test('communicative cards preserve source picture references, teacher instructions and speaking timer settings',()=>{
  const e=newImportElement('ca-speaking');
  e.data.instruction='Describe the image to your partner.';
  e.data.cards=[{title:'',text:'',picture:'picture:scene',alt:'A crowded station'}];
  e.data.seconds=95;e.data.timerDirection='up';e.data.timerFor='individual';
  const picture=newImportElement('picture');picture.data={ref:'scene',sourceImage:1,x:0,y:0,width:100,height:100,alt:'A crowded station',recreationPrompt:'A station',asset:'a'.repeat(64)};
  const rebuilt={tasks:[{inlineElements:[picture,e],subTasks:[]}]};
  assert.doesNotThrow(()=>checkImportPictures(rebuilt));
  assert.deepEqual(taskPictureIds(rebuilt.tasks[0],[picture.data]),[picture.data.asset]);
  const activity=Object.values(nativeImportedElements([e],'ca').activities)[0];
  assert.equal(activity.attrs.instruction,e.data.instruction);
  assert.deepEqual([activity.attrs.settings.seconds,activity.attrs.settings.timerDirection,activity.attrs.settings.timerFor],[95,'up','individual']);
  const resolved=resolveImportPictures(activity,[picture.data],{[picture.data.asset]:'https://example.com/resolved.png'});
  assert.equal(resolved.content[0].content[0].content[0].attrs.src,'https://example.com/resolved.png');
});

test('prepared Create with AI pictures are inserted into rich communicative card content',()=>{
 const e=newImportElement('ca-spot');
 e.data.cards=[{title:'A',text:'',picture:'',alt:''},{title:'B',text:'',picture:'',alt:''}];
 e.data.differences=[{x:40,y:60,radius:5,label:'Extra window'}];
 const task=importTask([e]);
 task.preparedMedia=[{kind:'image',mediaId:'one',alt:'Before'},{kind:'image',mediaId:'two',alt:'After'}];
 const native=nativeTask(task,0,'prepared');
 const cards=Object.values(native.activities)[0].content;
 assert.equal(native.content.content.filter(node=>node.type==='paragraph'&&node.content?.some(child=>child.type==='picture')).length,0,'prepared images are not duplicated outside the cards');
 assert.deepEqual(cards.map(card=>card.content[0].content[0].attrs.src),['media:one','media:two']);
 assert.deepEqual(cards.map(card=>card.attrs.picture.src),['media:one','media:two']);
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

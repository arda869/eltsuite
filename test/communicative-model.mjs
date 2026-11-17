import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/communicative/state.ts', 'src/communicative/model.ts'], bundle: true, write: false, outdir: 'unused', format: 'esm', platform: 'node' });
const modules = await Promise.all(bundle.outputFiles.map(f => import('data:text/javascript;base64,' + Buffer.from(f.text).toString('base64'))));
const { initialActivity, transition, configForLearner, stateForLearner } = modules[0];
const { boardLayout, bingoCards, bingoClaim, checkDominoes, dominoTiles, oppositePairs, parseItemList, validateActivity } = modules[1];
const people = [{ id: 'a', name: 'Amina' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Chen' }];
const teacher = { id: 'teacher', teacher: true }, learner = { id: 'a', teacher: false };
let seed = 817;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const config = (kind, count = 12, settings = {}) => ({ id: 'fixture', kind, instruction: 'Take turns.', items: Array.from({ length: count }, (_, n) => ({ id: 'i' + n, title: 'Word ' + n, match: 'Meaning ' + n })), settings: { mode: 'class', ...settings } });
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('PASS', name); };

test('All board layouts use each square once; spiral squares stay adjacent', () => {
 for(let count=12;count<=48;count++)for(const style of ['snake','spiral','path']){
  const {cols,rows,cells}=boardLayout(count,style);assert.equal(cells.length,count);assert.equal(new Set(cells.map(p=>p.row+':'+p.col)).size,count);assert.ok(cells.every(p=>p.row>=1&&p.row<=rows&&p.col>=1&&p.col<=cols));
  if(style==='spiral')for(let n=1;n<cells.length;n++)assert.equal(Math.abs(cells[n].row-cells[n-1].row)+Math.abs(cells[n].col-cells[n-1].col),1);
 }
});
test('paste preserves a phrase with = unless it is a spaced separator', () => assert.deepEqual(parseItemList('x=y\nlook up = find information\nhello\tbonjour'), [{ title: 'x=y' }, { title: 'look up', match: 'find information' }, { title: 'hello', match: 'bonjour' }]));
test('Bingo validates pool size and centre position', () => {
  assert.ok(validateActivity(config('bingo', 16)).some(i => i.field === 'items'));
  assert.ok(validateActivity(config('bingo', 20, { gridSize: 4, freeCentre: true })).some(i => i.field === 'freeCentre'));
});
test('Bingo gives 150 distinct cards from one shared bank', () => {
  const cards = bingoCards(config('bingo', 30), Array.from({ length: 150 }, (_, n) => ({ id: '' + n, name: 'Learner' })), random);
  assert.equal(new Set(Object.values(cards).map(x => x.join('|'))).size, 150);
  Object.values(cards).forEach(card => assert.equal(new Set(card).size, 16));
});
test('Bingo checks calls, lines and the full-card rule', () => {
  const card = Array.from({ length: 9 }, (_, n) => '' + n);
  assert.equal(bingoClaim(card, ['0', '1', '2'], ['0', '1'], 3, 'line').valid, false);
  assert.equal(bingoClaim(card, ['0', '1', '2'], ['0', '1', '2'], 3, 'line').valid, true);
  assert.equal(bingoClaim(card, ['0', '1', '2'], card, 3, 'twoLines').valid, false);
  assert.equal(bingoClaim(card, card, card, 3, 'full').valid, true);
});
test('Bingo free centre completes a valid diagonal', () => {
  const card = ['0', '1', '2', '3', '__free__', '5', '6', '7', '8'];
  assert.equal(bingoClaim(card, ['0', '8'], ['0', '8'], 3, 'line').valid, true);
});
test('Dominoes accepts every valid circular starting tile, but not a wrong join', () => {
  const items = config('dominoes').items;
  for (let n = 0; n < items.length; n++) assert.equal(checkDominoes(items, [...items.slice(n), ...items.slice(0, n)].map(i => i.id)), true);
  const order = items.map(i => i.id); [order[1], order[2]] = [order[2], order[1]];
  assert.equal(checkDominoes(items, order), false);
  assert.equal(dominoTiles(items)[0].right, 'Meaning 1');
});
test('Only the teacher can start; strangers cannot write a run', () => {
  const c = config('board'), s = initialActivity(c, people, random);
  assert.throws(() => transition(c, s, { type: 'start' }, learner, 1000), /teacher/);
  assert.throws(() => transition(c, s, { type: 'roll', die: 6 }, { id: 'stranger', teacher: false }, 1000), /Join/);
});
test('Board turns cannot be stolen or rolled twice', () => {
  const c = config('board'); let s = transition(c, initialActivity(c, people, random), { type: 'start' }, teacher, 1000);
  assert.throws(() => transition(c, s, { type: 'roll', die: 3 }, { id: 'b', teacher: false }, 1000), /turn/);
  s = transition(c, s, { type: 'roll', die: 3 }, learner, 1000);
  assert.equal(s.positions.a, 3);
  assert.throws(() => transition(c, s, { type: 'roll', die: 3 }, learner, 1000), /Finish/);
  assert.equal(transition(c, s, { type: 'nextTurn' }, learner, 1000).turn, 1);
});
test('Ranking needs every learner to agree again after a move', () => {
  const c = config('ranking', 4); let s = transition(c, initialActivity(c, people, random), { type: 'start' }, teacher, 1000);
  for (const p of people) s = transition(c, s, { type: 'agree' }, { id: p.id, teacher: false }, 1000);
  assert.equal(s.submitted, true);
  s = transition(c, s, { type: 'order', ids: [...s.order].reverse() }, learner, 1000);
  assert.equal(s.submitted, false); assert.deepEqual(s.agreed, []);
  assert.throws(() => transition(c, s, { type: 'order', ids: ['i0', 'i0', 'i1', 'i2'] }, learner, 1000), /every item/);
});
test('Private cue cards are withheld until Compare, including after End', () => {
  const c = config('cue', 3); let s = transition(c, initialActivity(c, people, random), { type: 'start' }, teacher, 1000, random);
  assert.equal(configForLearner(c, s, 'a').items.length, 1);
  const own = s.assignments.a[0];
  assert.deepEqual(configForLearner(c, s, 'a').items.map(i => i.id), [own]);
  s = transition(c, s, { type: 'end' }, teacher, 1000);
  assert.equal(configForLearner(c, s, 'a').items.length, 1);
  s = transition(c, s, { type: 'reveal' }, teacher, 1000);
  assert.equal(configForLearner(c, s, 'a').items.length, 3);
});
test('Spot-the-difference payload includes only the assigned picture, including item metadata',()=>{
 const c=config('spot',2,{versions:[{name:'A',picture:{src:'private-a',alt:'A'}},{name:'B',picture:{src:'private-b',alt:'B'}}],differences:[{id:'d',x:50,y:50,radius:10,label:'Private key'}]});c.items[0].picture=c.settings.versions[0].picture;c.items[1].picture=c.settings.versions[1].picture;
 const s=transition(c,initialActivity(c,people,random),{type:'start'},teacher,1000);
 const own=configForLearner(c,s,'a');assert.equal(own.items.length,1);assert.equal(own.settings.versions.length,1);assert.equal(JSON.stringify(own).includes('private-b'),false);assert.equal(JSON.stringify(own).includes('Private key'),false);
});
test('Rich questions inside assigned cards do not expose answer attributes',()=>{
 const c=config('cue',2);c.items.forEach(i=>i.content=[{type:'paragraph',content:[{type:'gap',attrs:{id:'nested',answers:['secret-answer']}}]}]);
 const s=transition(c,initialActivity(c,people,random),{type:'start'},teacher,1000);
 assert.equal(JSON.stringify(configForLearner(c,s,'a')).includes('secret-answer'),false);
});
test('Face-down memory cards have opaque tokens and no hidden faces in learner payloads',()=>{
 const c=config('memory',3);let s=transition(c,initialActivity(c,people,random),{type:'start'},teacher,1000);
 assert.equal(configForLearner(c,s,'a').items.length,0);assert.deepEqual(stateForLearner(c,s,'a').deckMap,{});assert.ok(s.deck.every(id=>!id.includes(':')));
 const first=Object.entries(s.deckMap).find(([,face])=>face.itemId==='i0'&&face.side==='a')[0];s=transition(c,s,{type:'flip',cardId:first},learner,1000);
 const payload=configForLearner(c,s,'a');assert.equal(payload.items.length,1);assert.equal(payload.items[0].title,'Word 0');assert.equal(payload.items[0].match,'');assert.equal(Object.keys(stateForLearner(c,s,'a').deckMap).length,1);
});
test('Domino learner payloads contain tile halves without the original solved pair list',()=>{
 const c=config('dominoes',3);const s=transition(c,initialActivity(c,people,random),{type:'start'},teacher,1000);const out=configForLearner(c,s,'a');
 assert.ok(out.items.every(i=>i.match===undefined));assert.equal(out.items.find(i=>i.id==='i0').dominoRight.text,'Meaning 1');assert.deepEqual(out.items.map(i=>i.id),s.order);
});
test('Opinions remain private until Reveal and anonymous results have no learner IDs', () => {
  const c = config('opinion', 1, { showNames: false }); let s = transition(c, initialActivity(c, people, random), { type: 'start' }, teacher, 1000);
  s = transition(c, s, { type: 'opinion', value: 30 }, learner, 1000);
  s = transition(c, s, { type: 'opinion', value: 80 }, { id: 'b', teacher: false }, 1000);
  assert.deepEqual(Object.keys(stateForLearner(c, s, 'a').opinions), ['a']);
  s = transition(c, s, { type: 'reveal' }, teacher, 1000);
  assert.deepEqual(Object.keys(stateForLearner(c, s, 'a').opinions), ['anonymous-0', 'anonymous-1']);
});
test('An odd number of opposite views makes a final group of three', () => {
  const groups = oppositePairs(Array.from({ length: 5 }, (_, n) => ({ id: '' + n, value: n * 25 })));
  assert.equal(groups.length, 2); assert.deepEqual(groups.flat().sort(), ['0', '1', '2', '3', '4']);
});
test('Find someone who enforces the name rule, with optional details blank', () => {
  const c = config('findSomeone', 6, { nameOnce: true }); let s = transition(c, initialActivity(c, people, random), { type: 'start' }, teacher, 1000);
  s = transition(c, s, { type: 'answer', itemId: 'i0', value: 'b' }, learner, 1000);
  assert.equal(s.answers.a.i0, 'b');
  assert.throws(() => transition(c, s, { type: 'answer', itemId: 'i1', value: 'b' }, learner, 1000), /not used/);
});
test('The speaking timer swaps roles and starts a new turn', () => {
  const c = config('speaking', 2, { seconds: 30 }); let s = transition(c, initialActivity(c, people, random), { type: 'start' }, teacher, 1000);
  assert.equal(s.endsAt, 31000);
  assert.throws(()=>transition(c,s,{type:'nextTurn'},learner,1000),/controls/);
  s = transition(c, s, { type: 'swap' }, teacher, 32000);
  assert.equal(s.turn, 1); assert.equal(s.endsAt, 62000);
});
test('Pair speaking roles swap once the server clock reaches the end',()=>{
 const c=config('speaking',3,{mode:'groups',seconds:30});let s=transition(c,initialActivity(c,people.slice(0,2),random),{type:'start'},teacher,1000);
 assert.throws(()=>transition(c,s,{type:'timerElapsed'},learner,30000),/Wait/);
 s=transition(c,s,{type:'timerElapsed'},learner,31000);assert.equal(s.turn,1);assert.equal(s.round,1);assert.equal(s.endsAt,61000);
});
console.log(`${checks} communicative activity checks passed.`);

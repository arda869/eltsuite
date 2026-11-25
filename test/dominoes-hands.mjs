// Dominoes, taking turns: tiles are dealt, a tile goes only where it fits, turns move on, and the
// line completes.
import assert from 'node:assert/strict';
const E = await import(new URL('../functions/communicative/engine.js', import.meta.url));
const items = ['cat', 'dog', 'fish', 'bird'].map((w, n) => ({ id: 'i' + n, title: w, match: 'a ' + w + ' (meaning)', content: [] }));
const c = { id: 'act1', kind: 'dominoes', instruction: '', items, settings: { mode: 'groups', dominoPlay: 'hands' } };
const people = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }];
let rnd = 0; const random = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
let s = E.transition(c, E.initialActivity(c, people, random), { type: 'start' }, { id: 't', teacher: true }, 1, random);
assert.equal(s.line.length, 1);
assert.equal(Object.values(s.hands).flat().length, 3, 'the other tiles are dealt');
const n = (id) => items.findIndex((i) => i.id === id);
for (let guard = 0; guard < 20 && s.line.length < 4; guard++) {
  const who = s.people[s.turn % 2].id;
  const last = n(s.line[s.line.length - 1]), first = n(s.line[0]);
  const fitEnd = s.hands[who].find((id) => n(id) === (last + 1) % 4);
  const fitStart = s.hands[who].find((id) => (n(id) + 1) % 4 === first);
  const wrong = s.hands[who].find((id) => id !== fitEnd && id !== fitStart);
  if (wrong) assert.throws(() => E.transition(c, s, { type: 'place', tileId: wrong, end: 'end' }, { id: who, teacher: false }, 2), /doesn’t fit/);
  if (fitEnd) s = E.transition(c, s, { type: 'place', tileId: fitEnd, end: 'end' }, { id: who, teacher: false }, 2);
  else if (fitStart) s = E.transition(c, s, { type: 'place', tileId: fitStart, end: 'start' }, { id: who, teacher: false }, 2);
  else s = E.transition(c, s, { type: 'pass' }, { id: who, teacher: false }, 2);
}
assert.equal(s.line.length, 4);
assert.equal(s.correct, true, 'the completed line is correct');
assert.throws(() => E.transition(c, { ...s, phase: 'running' }, { type: 'place', tileId: 'i0', end: 'end' }, { id: s.people[(s.turn + 1) % 2].id, teacher: false }, 3), /turn|hand/);
console.log('dominoes in turns: ok');

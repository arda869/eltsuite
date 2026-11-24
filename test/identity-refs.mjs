// Activity identities and inline references: stable targets, labels after rename and reorder,
// copies, missing targets, the A / B sign, and the icon library.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/lib/identity.ts', 'src/lib/identityIcons.ts'], bundle: true, write: false, outdir: 'unused', format: 'esm', platform: 'node' });
const [I, Icons] = await Promise.all(bundle.outputFiles.map((f) => import('data:text/javascript;base64,' + Buffer.from(f.text).toString('base64'))));
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('PASS', name); };

const act = { id: 'aid-1', name: 'Activation', colour: '#b4442e', icon: 'activation' };
const pron = { id: 'aid-2', name: 'Pronunciation', colour: '#1f6aa5', icon: 'pronunciation' };
const ref = (anchor) => ({ type: 'activityRef', attrs: { kind: 'activity', anchor } });
const lesson = () => [
  { id: 't1', title: 'Warm up', identity: act, content: { type: 'doc', content: [] } },
  { id: 's1', kind: 'section', title: 'Part 2' },
  { id: 't2', title: 'Sounds', identity: pron, content: { type: 'doc', content: [] } },
  { id: 't3', title: 'More sounds', identity: pron, content: { type: 'doc', content: [] } },
  { id: 't3b', title: 'More sounds B', family: 't3', variant: 'B', identity: pron, content: null },
  { id: 't4', title: 'Speak', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use ' }, ref('t1'), { type: 'text', text: ' and ' }, ref('t3')] }] } },
];

test('Targets skip sections and extra versions, and number as printed', () => {
  const t = I.refTargets(lesson());
  assert.deepEqual(t.map((x) => [x.anchor, x.n]), [['t1', 1], ['t2', 2], ['t3', 3], ['t4', 4]]);
});

test('A type used once has no number; a type used twice is numbered within the type', () => {
  const t = I.refTargets(lesson());
  assert.equal(I.refText(I.resolveRef({ kind: 'activity', anchor: 't1' }, t)), 'Activation');
  assert.equal(I.refText(I.resolveRef({ kind: 'activity', anchor: 't3' }, t)), 'Pronunciation 2');
  assert.equal(I.refText(I.resolveRef({ kind: 'activity', anchor: 't4' }, t)), 'Exercise 4');
});

test('Renaming the type or reordering the lesson changes the label, not the target', () => {
  const tasks = lesson();
  tasks[0].identity = { ...act, name: 'Lead-in' };
  const reordered = [tasks[3], tasks[2], tasks[0], tasks[5]];
  const t = I.refTargets(reordered);
  assert.equal(I.refText(I.resolveRef({ kind: 'activity', anchor: 't1' }, t)), 'Lead-in');
  assert.equal(I.refText(I.resolveRef({ kind: 'activity', anchor: 't3' }, t)), 'Pronunciation 1');
});

test('A copied lesson keeps anchors, so references still resolve with new task ids', () => {
  const copy = lesson().map((x, i) => ({ ...x, id: 'new' + i, anchor: x.id }));
  const t = I.refTargets(copy);
  const v = I.resolveRef({ kind: 'activity', anchor: 't3' }, t);
  assert.equal(v.missing, false);
  assert.equal(v.id, 'new3');
});

test('A missing target is flagged and keeps its last label', () => {
  const t = I.refTargets(lesson().filter((x) => x.id !== 't1'));
  const v = I.resolveRef({ kind: 'activity', anchor: 't1', snap: { label: 'Activation' } }, t);
  assert.equal(v.missing, true);
  assert.equal(v.label, 'Activation');
});

test('refreshRefs writes current labels into every reference, for paper and copies', () => {
  const tasks = lesson();
  const fresh = I.refreshRefs(tasks, I.refTargets(tasks));
  const refs = fresh[5].content.content[0].content.filter((n) => n.type === 'activityRef');
  assert.deepEqual(refs.map((r) => r.attrs.snap.label), ['Activation', 'Pronunciation']);
  assert.equal(refs[1].attrs.snap.n, 2);
});

test('Version references show only the sign and name, never content', () => {
  const v = I.resolveRef({ kind: 'version', version: 'Learner B' }, null);
  assert.equal(v.label, 'Learner B');
  assert.equal(v.version, 'B');
  const html = I.refHtml(v);
  assert.match(html, /class="vsign" data-v="B"/);
  assert.ok(!/content|answer/i.test(html));
  assert.equal(I.versionLetter('Version A'), 'A');
  assert.equal(I.versionLetter('Customer'), '');
});

test('Paper HTML escapes names and keeps the identity readable without colour', () => {
  const html = I.identityHtml({ id: 'x', name: 'Q&A <b>', colour: '#123456', icon: 'speaking' });
  assert.match(html, /Q&amp;A &lt;b&gt;/);
  assert.match(html, /<svg/);
});

test('Hub sections: versions count once and section ids are anchors', () => {
  const t = I.hubRefTargets([
    { id: 'n', title: 'Notes', audience: 'teacher' },
    { id: 'a', title: 'Cards', audience: 'learner', versionGroup: 'g', versionLabel: 'Learner A' },
    { id: 'b', title: 'Cards', audience: 'learner', versionGroup: 'g', versionLabel: 'Learner B' },
    { id: 'c', title: 'Report', audience: 'learner' },
  ]);
  assert.deepEqual(t.map((x) => [x.anchor, x.n]), [['a', 1], ['c', 2]]);
});

test('The icon library has at least 100 distinct icons that all search and draw', () => {
  const list = Icons.IDENTITY_ICONS;
  assert.ok(list.length >= 100, `only ${list.length} icons`);
  assert.equal(new Set(list.map((i) => i.key)).size, list.length, 'duplicate keys');
  assert.equal(new Set(list.map((i) => i.svg)).size, list.length, 'two icons draw the same');
  for (const i of list) assert.ok(Icons.iconSvg(i.key).startsWith('<svg'), i.key);
  assert.ok(Icons.searchIcons('speak').some((i) => i.key === 'speaking'));
  assert.ok(Icons.searchIcons('sound wave').some((i) => i.key === 'pronunciation'));
  assert.equal(Icons.searchIcons('zzzz').length, 0);
});

test('Saved identities are cleaned: a name is needed, colours and icons are checked', () => {
  assert.equal(I.cleanIdentity({ name: '  ' }), null);
  const c = I.cleanIdentity({ id: 'x', name: 'Grammar', colour: 'red', icon: 'nope' });
  assert.equal(c.colour, I.IDENTITY_COLOURS[4].v);
  assert.equal(c.icon, '');
});

console.log(`${checks} identity and reference checks passed`);

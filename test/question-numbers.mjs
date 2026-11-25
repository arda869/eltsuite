// Question numbers: numbered lists carry on through a task (no two questions share a number), and a
// coursebook's own numbers before gaps are left out.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
await build({ entryPoints: ['src/lib/olNumbers.ts'], bundle: true, outfile: 'node_modules/.cache/ol-numbers-test.mjs', format: 'esm', platform: 'node', external: ['@tiptap/react'], logLevel: 'silent' });
const O = await import(new URL('../node_modules/.cache/ol-numbers-test.mjs', import.meta.url));
const li = () => ({ type: 'listItem', content: [{ type: 'paragraph' }] });
const doc = { type: 'doc', content: [
  { type: 'orderedList', content: [li(), li(), li()] },
  { type: 'paragraph' },
  { type: 'orderedList', content: [li(), li()] },
  { type: 'orderedList', attrs: { start: 10 }, content: [li()] },
  { type: 'orderedList', content: [li()] },
] };
const s = O.olStarts(doc);
assert.deepEqual(doc.content.filter((n) => n.type === 'orderedList').map((n) => s.get(n)), [1, 4, 10, 11]);
const gap = { type: 'gap', attrs: { id: 'g' } };
const para = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Excuse me, ¹ ' }, gap, { type: 'text', text: ' I in room 2?' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'I ' }, { type: 'text', text: '2', marks: [{ type: 'superscript' }] }, gap] }] };
const out = O.dropSourceNumbers(para);
assert.equal(out.content[0].content[0].text, 'Excuse me, ');
assert.deepEqual(out.content[1].content.map((n) => n.text ?? n.type), ['I ', 'gap']);
console.log('question numbers: ok');

// Search everything: every word must be found, names beat text, whole names beat parts, accents
// and case do not matter, and the snippet shows the words found in a message or document.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
await build({ entryPoints: ['src/search/engine.ts'], bundle: true, outfile: 'node_modules/.cache/search-engine-test.mjs', format: 'esm', platform: 'node', logLevel: 'silent' });
const S = await import(new URL('../node_modules/.cache/search-engine-test.mjs', import.meta.url));
const list = [
  { key: 'a', group: 'Files', title: 'Café vocabulary', to: '/a', icon: 'x' },
  { key: 'b', group: 'Messages', title: 'Ana in B1 Tuesday', text: 'Could you send the café worksheet before Friday?', to: '/b', icon: 'x', at: Date.now() },
  { key: 'c', group: 'Lessons', title: 'Present perfect: experiences', sub: 'Demo class', to: '/c', icon: 'x' },
  { key: 'd', group: 'Files', title: 'Worksheet answers', text: 'present perfect key', to: '/d', icon: 'x' },
].map(S.indexed);
assert.deepEqual(S.search(list, 'cafe').map((h) => h.e.key), ['a', 'b'], 'accents do not matter, names come first');
assert.deepEqual(S.search(list, 'CAFÉ worksheet').map((h) => h.e.key), ['b'], 'every word must be found');
const hit = S.search(list, 'worksheet friday')[0];
assert.equal(hit.e.key, 'b');
assert.equal(hit.snippet.match.toLowerCase(), 'worksheet', 'the snippet shows the word found');
assert.deepEqual(S.search(list, 'present perfect').map((h) => h.e.key), ['c', 'd'], 'a name beats words inside a file');
assert.deepEqual(S.search(list, 'demo').map((h) => h.e.key), ['c'], 'where something is counts too');
assert.equal(S.search(list, 'zzz').length, 0);
assert.equal(S.search(list, '   ').length, 0);
console.log('search engine: ok');

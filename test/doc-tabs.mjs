// Tab stops and indents in Collab documents: Tab reaches the next stop set on the ruler, then every
// 1.27 cm; older documents' indent steps read as 1.27 cm each; a hanging indent prints as one.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
await build({ entryPoints: ['src/collab/DocumentStructure.ts'], bundle: true, outfile: 'node_modules/.cache/doc-tabs-test.mjs', format: 'esm', platform: 'node', logLevel: 'silent' });
const D = await import(new URL('../node_modules/.cache/doc-tabs-test.mjs', import.meta.url));
assert.equal(D.nextStop(0, [302]), 302, 'the first stop set on the ruler');
assert.equal(D.nextStop(310, [302]), 336, 'past the last stop: every 1.27 cm');
assert.equal(D.nextStop(10, []), 48);
assert.equal(D.nextStop(48, []), 96, 'a tab exactly on a stop goes to the next one');
assert.equal(D.nextStop(302, [100, 302], true), 100, 'Shift+Tab goes back a stop');
assert.equal(D.nextStop(30, [], true), 0);
assert.deepEqual(D.indentsOf({ indent: 2 }), { left: 96, first: 0, right: 0 }, 'old step indents');
assert.deepEqual(D.indentsOf({ indent: 2, indentPx: 75, firstLine: -75, indentRight: 20 }), { left: 75, first: -75, right: 20 });
assert.equal(D.indentCss({ indentPx: 75, firstLine: -75 }), 'margin-inline-start:75px;text-indent:-75px');
assert.equal(D.indentCss({}), '');
console.log('collab tab stops and indents: ok');

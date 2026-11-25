// Headers and footers: fields are filled in on each page, the first page can differ, and the
// footer text and page number share a place without losing either.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
await build({ entryPoints: ['src/collab/documentLayout.ts'], bundle: true, outfile: 'node_modules/.cache/collab-running-test.mjs', format: 'esm', platform: 'node', logLevel: 'silent' });
const L = await import(new URL('../node_modules/.cache/collab-running-test.mjs', import.meta.url));
const layout = { ...L.LAYOUT_DEFAULT, paged: true, header: '{title} · Unit 4', footer: 'Page {page} of {pages}', footerAlign: 'left', headerAlign: 'right', pageNumbers: true, numberStyle: 'n', numberAlign: 'left', firstDifferent: true, headerFirst: 'Cover', footerFirst: '' };
const p2 = L.runningOf(layout, 1, 5, { title: 'Hotel dialogue' });
assert.equal(p2.header, 'Hotel dialogue · Unit 4');
assert.equal(p2.footer, 'Page 2 of 5');
assert.equal(p2.headerAlign, 'right');
assert.deepEqual(L.footerSlots(p2), { left: 'Page 2 of 5 · 2', center: '', right: '' });
const p1 = L.runningOf(layout, 0, 5, { title: 'Hotel dialogue' });
assert.equal(p1.header, 'Cover', 'the first page has its own header');
const css = L.marginBoxesCss(layout, { title: 'Hotel dialogue' });
assert.ok(css.includes('@top-right { content: "Hotel dialogue · Unit 4"'), 'header placed right in print');
assert.ok(css.includes('"Page " counter(page) " of " counter(pages)'), 'fields become page counters in print');
console.log('collab running heads: ok');

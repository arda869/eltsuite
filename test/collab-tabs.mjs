// Document tabs: older documents open as one tab, tabs keep separate text, duplicate copies the
// text, removing a tab removes its text, and the whole document lists every tab in order.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
// Written inside node_modules so it shares the one copy of yjs with this test.
await build({ entryPoints: ['src/collab/tabs.ts'], bundle: true, outfile: 'node_modules/.cache/collab-tabs-test.mjs', format: 'esm', platform: 'node', external: ['react', 'yjs'], logLevel: 'silent' });
const T = await import(new URL('../node_modules/.cache/collab-tabs-test.mjs', import.meta.url));
const Y = await import('yjs');
const para = (text) => { const p = new Y.XmlElement('paragraph'); p.insert(0, [new Y.XmlText(text)]); return p; };
const textOf = (f) => f.toArray().map((n) => n.toString().replace(/<[^>]+>/g, '')).join('|');
const doc = new Y.Doc();
doc.getXmlFragment('default').insert(0, [para('Aims')]);
assert.deepEqual(T.readTabs(doc), [T.FIRST_TAB], 'an older document is one tab');
const b = T.addTab(doc, 'Learner A');
doc.getXmlFragment(T.fieldOf(b)).insert(0, [para('Lisbon')]);
assert.equal(textOf(doc.getXmlFragment('default')), 'Aims');
assert.equal(textOf(doc.getXmlFragment(T.fieldOf(b))), 'Lisbon');
T.renameTab(doc, b, '  Learner B  ');
assert.equal(T.readTabs(doc)[1].title, 'Learner B');
const c = T.duplicateTab(doc, b);
assert.equal(textOf(doc.getXmlFragment(T.fieldOf(c))), 'Lisbon');
assert.deepEqual(T.readTabs(doc).map((t) => t.title), ['Tab 1', 'Learner B', 'Learner B (copy)']);
T.moveTab(doc, c, -2);
assert.equal(T.readTabs(doc)[0].id, c);
T.removeTab(doc, b);
assert.equal(doc.getXmlFragment(T.fieldOf(b)).length, 0);
assert.equal(T.readTabs(doc).length, 2);
const whole = T.allTabsJSON(doc, (f) => ({ content: f.toArray().map((n) => ({ type: 'p', text: textOf({ toArray: () => [n] }) })) }));
assert.deepEqual(whole.content.filter((n) => n.type === 'heading').map((n) => n.content[0].text), ['Learner B (copy)', 'Tab 1']);
T.removeTab(doc, c); assert.throws(() => assert.notEqual(T.readTabs(doc).length, 1));
T.removeTab(doc, 'default'); assert.equal(T.readTabs(doc).length, 1, 'the last tab stays');
console.log('PASS document tabs');

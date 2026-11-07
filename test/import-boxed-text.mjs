import assert from 'node:assert/strict';
import { IMPORT_TYPE_BY_KIND } from '../functions/ai/import-types.js';
import { checkImportElements } from '../functions/ai/import-validation.js';
import { nativeImportedElements } from '../functions/ai/import-elements.js';
import { importModelSchema, fromImportModel } from '../functions/ai/import-model.js';

const boxed = {
  kind: 'boxedText', prompt: 'You should spend about 20 minutes on this task.',
  reason: 'The writing instructions are grouped in a shaded source box.',
  feedback: '', example: false, needs: [],
  data: { style: 'box', tone: 'sky', label: '', text: 'Your friend has been offered a place on a course.\n\nWrite an email to your friend.\n• Describe where you lived.\n• Recommend a place to live.' },
};
assert.ok(IMPORT_TYPE_BY_KIND.has('boxedText'));
assert.ok(importModelSchema(false).$defs.importElement.anyOf.some(type => type.properties.kind.enum[0] === 'boxedText'));
checkImportElements([boxed], false);
const imported = nativeImportedElements([boxed]);
assert.equal(imported.content[0].type, 'paragraph');
const box = imported.content.find(node => node.type === 'textBox');
assert.deepEqual({ style: box.attrs.style, tone: box.attrs.tone }, { style: 'box', tone: 'sky' });
assert.equal(box.content.length, 2);
assert.ok(JSON.stringify(box).includes('Recommend a place to live.'));
const model = { kind: 'boxedText', prompt: boxed.prompt, selectionReason: boxed.reason,
  feedback: '', example: false, needs: [], ...boxed.data };
assert.deepEqual(fromImportModel({ tasks: [{ inlineElements: [model], subTasks: [] }] }).tasks[0].inlineElements[0], boxed);
console.log('PASS: source writing prompt stays in an editable blue box with its surrounding instruction separate.');

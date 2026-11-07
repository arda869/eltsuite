import assert from 'node:assert/strict';
import { IMPORT_TYPE_BY_KIND } from '../functions/ai/import-types.js';
import { checkImportElements } from '../functions/ai/import-validation.js';
import { nativeImportedElements } from '../functions/ai/import-elements.js';
import { importModelSchema, fromImportModel } from '../functions/ai/import-model.js';
import { checkActivities, nativeTask } from '../functions/ai/activities.js';

const dialogue = {
  kind: 'dialogue', prompt: 'Complete the conversation.', reason: 'The source has named speaker turns.',
  feedback: '', example: false, needs: [],
  data: { layout: 'stacked', turns: [
    { speaker: 'Student', text: 'Excuse me, ___ I in room 2?', answers: ['am'] },
    { speaker: 'Receptionist', text: 'What is your name?', answers: [] },
    { speaker: 'Student', text: 'I ___ Caroline.', answers: ["'m"] },
  ] },
};
assert.ok(IMPORT_TYPE_BY_KIND.has('dialogue'));
assert.ok(importModelSchema(false).$defs.importElement.anyOf.some(type => type.properties.kind.enum[0] === 'dialogue'));
checkImportElements([dialogue], false);
const imported = nativeImportedElements([dialogue]);
const node = imported.content.find(value => value.type === 'dialogue');
assert.deepEqual(node.attrs.speakers, ['Student', 'Receptionist']);
assert.deepEqual(node.content.map(turn => turn.attrs.who), [0, 1, 0]);
assert.equal(node.content[0].content[1].type, 'gap');
assert.deepEqual(imported.key.import_e0_gap0_0.answers, ['am']);
assert.deepEqual(imported.key.import_e0_gap2_0.answers, ["'m"]);
assert.ok(!JSON.stringify(imported.content).includes('"answers":["am"]'));
assert.throws(() => checkImportElements([{ ...dialogue, data: { ...dialogue.data, turns: dialogue.data.turns.map((turn, i) => i === 0 ? { ...turn, answers: [] } : turn) } }], false), /one answer for each/);

const model = { kind: 'dialogue', prompt: dialogue.prompt, selectionReason: dialogue.reason,
  feedback: '', example: false, needs: [], layout: 'stacked', turns: dialogue.data.turns };
assert.deepEqual(fromImportModel({ tasks: [{ inlineElements: [model], subTasks: [] }] }).tasks[0].inlineElements[0], dialogue);

const block = { kind: 'dialogue', title: 'At reception', text: '', items: ['Student: Excuse me, am I in room 2?', 'Receptionist: What is your name?', 'Student: I am Caroline.'] };
const task = { stageId: 'stage', title: 'At reception', format: 'reading', mediaPlan: [], layout: 'stacked', imageLayout: 'row', teacherOnlyInput: '', roles: [], minutes: 5,
  instructions: 'Read the conversation.', input: 'A short conversation at reception.', structures: [], blocks: [block], definitions: [], subTasks: [], questions: [], visuals: [], versions: [], teacherNotes: 'Read the turns together.', support: '', challenge: '' };
const plan = { stages: [{ id: 'stage', minutes: 5 }] };
const activities = { title: 'At reception', rationale: 'A conversation', differentiation: 'Not requested', recycling: 'Not requested', tasks: [task] };
checkActivities(activities, plan);
const generated = nativeTask(task, 0).content.content.find(value => value.type === 'dialogue');
assert.deepEqual(generated.attrs.speakers, ['Student', 'Receptionist']);
assert.equal(generated.content[1].content[0].text, 'What is your name?');
assert.throws(() => checkActivities({ ...activities, tasks: [{ ...task, blocks: [{ ...block, items: ['Student speaks without a colon', 'Receptionist: Hello'] }] }] }, plan), /dialogue needs/);
console.log('PASS: imported and generated conversations become editable native Dialogues, with answer keys private and invalid turns rejected.');

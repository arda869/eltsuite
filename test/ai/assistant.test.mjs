import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlan, validateBrief, validate, checkSequence, outlineSchema } from '../../functions/ai/contract.js';
import { generate } from '../../functions/ai/provider.js';
const brief = { topic: 'Travel', objectives: 'Compare two travel options and agree on a choice.', context: 'Adult group, pairs, board available.', level: 'B1', methodology: 'Task-based', duration: 60 };
const outline = { title: 'Choose a trip', outcomes: ['Compare options'], methodology: 'Task-based', rationale: 'A practical decision drives language use.', stages: [{ id: 'task', title: 'Choose', aim: 'Agree on a trip', minutes: 60, interaction: 'Pairs' }] };
test('ownership and co-teacher access, excluding viewers, learners and suspended accounts', () => {
  const c = { teacherId: 'owner', coTeachers: { co: { role: 'co' }, viewer: { role: 'viewer' } } };
  for (const uid of ['owner', 'co']) assert.equal(canPlan(uid, { role: 'teacher' }, {}, c), true);
  for (const uid of ['outsider', 'viewer']) assert.equal(canPlan(uid, { role: 'teacher' }, {}, c), false);
  assert.equal(canPlan('owner', { role: 'learner' }, {}, c), false);
  assert.equal(canPlan('owner', { role: 'teacher' }, { suspended: true }, c), false);
  assert.equal(canPlan('owner', { role: 'teacher' }, { over: true }, c), false);
});
test('brief rejects out-of-bounds inputs and drops unrelated data', () => {
  assert.deepEqual(validateBrief({ ...brief, learnerNames: ['Do not pass through'] }), brief);
  for (const patch of [{ duration: 0 }, { duration: 60.5 }, { duration: 181 }, { objectives: '' }, { context: 'x'.repeat(2001) }, { level: 'unknown' }, { methodology: 'whatever' }]) assert.throws(() => validateBrief({ ...brief, ...patch }));
});
test('strict output shape, timing and reference validation', () => {
  assert.deepEqual(checkSequence(validate(outlineSchema, outline), 60), outline);
  assert.throws(() => validate(outlineSchema, { ...outline, hiddenInstruction: 'x' }));
  assert.throws(() => validate(outlineSchema, { ...outline, stages: [] }));
  assert.throws(() => checkSequence(outline, 45));
  assert.throws(() => checkSequence({ ...outline, stages: [outline.stages[0], outline.stages[0]] }, 120));
  assert.throws(() => checkSequence({ stages: [{ id: 'a', minutes: 60, materialIds: ['missing'] }], learnerMaterials: [] }, 60));
});
const args = { apiKey: 'test-only', model: 'gpt-6.1-sol', schema: outlineSchema, name: 'outline', input: brief };
const response = body => async () => ({ ok: true, json: async () => body });
test('provider requests non-stored structured output and parses only completed content', async () => {
  const result = await generate({ ...args, fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true); assert.equal(body.model, args.model);
    assert.equal(body.max_output_tokens, 12000); assert.equal(body.reasoning.effort, 'low');
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(outline) }] }], usage: { input_tokens: 100, output_tokens: 200 } }) };
  } });
  assert.deepEqual(result.value, outline); assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 200 });
});
test('provider rejects refusal, truncation, wrong shape and HTTP errors', async () => {
  for (const body of [
    { status: 'incomplete' },
    { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] },
    { status: 'completed', output: [{ content: [{ type: 'output_text', text: '{}' }] }] },
    { status: 'completed', output: [{ content: [{ type: 'output_text', text: 'not JSON' }] }] },
  ]) await assert.rejects(generate({ ...args, fetchImpl: response(body) }));
  await assert.rejects(generate({ ...args, fetchImpl: async () => ({ ok: false }) }));
});

test('objectives and context suffice without a topic; additional objectives are preserved',()=>{
 const {topic,...input}=brief;
 const output=validateBrief({...input,additionalObjectives:['Ask for clarification.','']});
 assert.equal(output.topic,'');assert.deepEqual(output.additionalObjectives,['Ask for clarification.']);
 assert.throws(()=>validateBrief({...input,additionalObjectives:['x'.repeat(2001)]}));
});

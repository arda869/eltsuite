import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../../functions/ai/provider.js';
import { GenerationError, describeFailure, httpFailure } from '../../functions/ai/errors.js';
import { outlineSchema } from '../../functions/ai/contract.js';
const args = { apiKey: 'test-only', model: 'gpt-6.1-sol', schema: outlineSchema, name: 'plan', input: {} };
const secretText = 'SECRET-KEY-and-private-learner-content';
test('provider HTTP failures distinguish quota, key, access, rate and request errors without exposing response bodies', async () => {
  for (const [status, code, expected] of [[429, 'insufficient_quota', 'billing'], [401, 'invalid_api_key', 'credentials'], [404, 'model_not_found', 'model_access'], [403, 'x', 'access'], [429, 'x', 'rate_limit'], [400, 'invalid_json_schema', 'request'], [503, 'x', 'provider']]) {
    await assert.rejects(generate({ ...args, fetchImpl: async () => ({ ok: false, status, json: async () => ({ error: { code, message: secretText } }) }) }), e => e.reason === expected && !e.message.includes(secretText));
    assert.equal(httpFailure(status, code).reason, expected);
  }
});
test('timeouts and output exhaustion are distinguishable from billing failures', async () => {
  await assert.rejects(generate({ ...args, fetchImpl: async () => { throw Object.assign(Error(secretText), { name: 'TimeoutError' }); } }), e => e.reason === 'timeout');
  await assert.rejects(generate({ ...args, fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }) }) }), e => e.reason === 'output_limit');
  await assert.rejects(generate({ ...args, fetchImpl: async () => { throw Error(secretText); } }), e => e.reason === 'connection');
});
test('plan instructions explicitly preserve the approved sequence', async () => {
  await assert.rejects(generate({ ...args, fetchImpl: async (_url, options) => {
    assert.match(JSON.parse(options.body).instructions, /Preserve every stage ID, order and minute value exactly/);
    return { ok: false, status: 503, json: async () => ({}) };
  } }), e => e.reason === 'provider');
});
test('public diagnostics use only fixed messages and identify the failing pass', () => {
  const known = describeFailure(new GenerationError('timeout'), 'review');
  assert.equal(known.reason, 'timeout'); assert.equal(known.phase, 'review');
  assert.match(known.message, /\[review:timeout\]/);
  const unknown = describeFailure(Error(secretText), secretText);
  assert.equal(unknown.reason, 'unknown'); assert.equal(unknown.phase, 'unknown');
  assert.equal(JSON.stringify(unknown).includes(secretText), false);
});
test('oversized editorial input is diagnosed before any paid request and does not expose its content',async()=>{
 let called=false;
 await assert.rejects(generate({...args,input:{text:secretText.repeat(20000)},fetchImpl:async()=>{called=true;}}),e=>e.reason==='input_limit'&&!e.message.includes(secretText));
 assert.equal(called,false);
});
test('long editorial drafts fit review and targeted repair without dropping learner content',async()=>{
 const {revisionSchema}=await import('../../functions/ai/revision.js');
 const {editorialStandard}=await import('../../functions/ai/editorial.js');
 const material='Complete learner material. '.repeat(2000);
 for(const name of ['review','editorial_repair','lesson_revision']) {
  let called=false;
  await assert.rejects(generate({...args,name,schema:revisionSchema,instructions:editorialStandard,input:{currentDraft:{material}},fetchImpl:async(_url,options)=>{
   called=true;const body=JSON.parse(options.body);
   assert.equal(JSON.parse(body.input).currentDraft.material,material);
   assert.ok(Buffer.byteLength(options.body)<90000);
   return {ok:false,status:503,json:async()=>({})};
  }}),e=>e.reason==='provider');
  assert.equal(called,true);
 }
});

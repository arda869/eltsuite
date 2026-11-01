import test from 'node:test';import assert from 'node:assert/strict';
import {generate} from '../../functions/ai/provider.js';
const schema={type:'object',additionalProperties:false,required:['ok'],properties:{ok:{type:'string',minLength:1,maxLength:5}}};
const args={apiKey:'test-only',model:'gpt-6.1-sol',name:'lesson_revision',schema,input:{currentDraft:'Complete preserved learner material. '.repeat(2800)}};
const complete={status:'completed',output:[{content:[{type:'output_text',text:'{"ok":"yes"}'}]}],usage:{input_tokens:30000,output_tokens:10}};
test('large valid requests are counted exactly before generation with the same content and schema',async()=>{
 const calls=[];const result=await generate({...args,fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});return {ok:true,json:async()=>url.endsWith('/input_tokens')?{object:'response.input_tokens',input_tokens:30000}:complete};}});
 assert.equal(result.value.ok,'yes');assert.equal(calls.length,2);assert.ok(calls[0].url.endsWith('/input_tokens'));
 for(const key of ['model','input','instructions','reasoning','text'])assert.deepEqual(calls[0].body[key],calls[1].body[key]);
 assert.equal(JSON.parse(calls[1].body.input).currentDraft,args.input.currentDraft);assert.equal(calls[0].body.truncation,'disabled');
});
test('over-budget, invalid and failed token counts never proceed to generation',async()=>{
 for(const [data,ok,status,reason] of [[{object:'response.input_tokens',input_tokens:100001},true,200,'input_limit'],[{input_tokens:1},true,200,'provider'],[{error:{code:'invalid_api_key',message:'private'}},false,401,'credentials']]){
  let calls=0;await assert.rejects(generate({...args,fetchImpl:async url=>{calls++;assert.ok(url.endsWith('/input_tokens'));return{ok,status,json:async()=>data};}}),e=>e.reason===reason&&!e.message.includes('private'));assert.equal(calls,1);
 }
});

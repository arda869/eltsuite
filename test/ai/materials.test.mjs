import test from 'node:test';
import assert from 'node:assert/strict';
import {materialSource,checkRebuild,RIGHTS_VERSION,rebuildSchema} from '../../functions/ai/material-contract.js';
import {nativeTask} from '../../functions/ai/activities.js';
import {generate} from '../../functions/ai/provider.js';
import {rebuilt} from './material-fixture.mjs';
const input={rightsAccepted:true,rightsVersion:RIGHTS_VERSION,creationType:'homework',scope:'item',source:{name:'Worksheet',text:'Which day?',images:[]}};
test('source-only import accepts blank optional instructions but enforces consent, format, bounds and no remote images',()=>{
 assert.equal(materialSource(input).instructions,'');
 for(const patch of [{rightsAccepted:false},{rightsVersion:'old'},{creationType:'code'},{scope:'replace'}, {instructions:'x'.repeat(2001)},{source:{...input.source,text:'x'.repeat(30001)}},{source:{...input.source,text:'',images:[]}},{source:{...input.source,images:['https://private.example/image.jpg']}}])assert.throws(()=>materialSource({...input,...patch}));
});
test('rebuilt output has valid native tasks and private keys; validates review edits',()=>{
 assert.equal(checkRebuild({...rebuilt,warnings:Array.from({length:50},(_,i)=>'Review note '+i)},'task').warnings.length,50);
 assert.equal(checkRebuild(rebuilt,'task'),rebuilt);const n=nativeTask(rebuilt.tasks[0],0);assert.equal(n.key.q0_0.answers[0],'Saturday');assert.ok(!JSON.stringify(n.content).includes('Teacher key'));assert.ok(n.content.content.some(x=>x.type==='table'));assert.equal(n.content.content[0].attrs.style,'email');
 const two={...rebuilt,tasks:[rebuilt.tasks[0],{...rebuilt.tasks[0],stageId:'source2'}]};checkRebuild(two,'item');assert.throws(()=>checkRebuild(two,'task'));
 for(const change of [{questions:[{...rebuilt.tasks[0].questions[0],format:'choice',options:['A','B'],answer:'C'}]},{visuals:[{title:'Bad table',headers:['A','B'],rows:[['Only one']]}]},{roles:[{label:'A',input:'Hidden'}]},{format:'listening'}])assert.throws(()=>checkRebuild({...rebuilt,tasks:[{...rebuilt.tasks[0],...change}]},'item'));
});
test('multimodal rebuild uses non-stored structured Responses input without changing text-only generation',async()=>{
 let body;const result=await generate({apiKey:'test',model:'gpt-6.1-sol',schema:rebuildSchema,name:'rebuild',input:{text:'Read the page'},sourceImages:['data:image/jpeg;base64,/9j/'],fetchImpl:async(_,o)=>{body=JSON.parse(o.body);return {ok:true,json:async()=>({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(rebuilt)}]}]})};}});
 assert.equal(body.store,false);assert.equal(body.input[0].content[1].type,'input_image');assert.equal(body.input[0].content[0].type,'input_text');assert.equal(result.value.title,rebuilt.title);
});

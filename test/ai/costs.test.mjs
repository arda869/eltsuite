import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateCost,normaliseUsage,recommendedCredits} from '../../functions/costs/pricing.js';
import {costReport} from '../../functions/costs/report.js';
import {validateSettings} from '../../functions/costs/admin.js';
import {AI_FEATURES} from '../../functions/ai/features.js';
test('cached text tokens and output including reasoning are priced once; ceiling credits guarantees 75%',()=>{
 const usage=normaliseUsage('gpt-6.1-sol',{usage:{input_tokens:1000,input_tokens_details:{cached_tokens:600},output_tokens:200,output_tokens_details:{reasoning_tokens:100}}});
 assert.deepEqual(usage,{textInput:400,textCached:600,textOutput:200});
 const cost=calculateCost('gpt-6.1-sol',usage);assert.equal(cost.costMicroUsd,2860);assert.equal(cost.basis,'provider_usage');assert.equal(recommendedCredits(2860),2);
 for(const cost of [0,1,2499,2500,2501,80000,1200000]){const credits=recommendedCredits(cost);assert.ok(credits*10000*.25>=cost);}
});
test('images separate text, image and cache; incomplete cache data is never guessed',()=>{
 const u=normaliseUsage('gpt-image-2.5-flare',{usage:{input_tokens_details:{text_tokens:100,image_tokens:200},output_tokens:300}});
 assert.equal(calculateCost('gpt-image-2.5-flare',u).costMicroUsd,11100);
 assert.deepEqual(normaliseUsage('gpt-image-2.5-flare',{usage:{input_tokens_details:{text_tokens:100,image_tokens:200,cached_tokens:100},output_tokens:300}}),{});
});
test('speech bills audio and text separately, including cached audio',()=>{
 const u=normaliseUsage('gpt-realtime-2.1-mini',{usage:{input_token_details:{text_tokens:100,audio_tokens:200,cached_tokens:100,cached_tokens_details:{audio_tokens:100}},output_token_details:{text_tokens:50,audio_tokens:300}}});
 assert.equal(calculateCost('gpt-realtime-2.1-mini',u).costMicroUsd,7210);
});
test('music uses per-song prices; video and duration transcription remain estimates',()=>{
 assert.equal(calculateCost('lyria-3.5',{songs:1},'calculated_units').costMicroUsd,80000);
 assert.equal(calculateCost('lyria-3-clip-preview',{songs:1},'calculated_units').costMicroUsd,40000);
 assert.equal(calculateCost('gen4.5',{videoSeconds:10},'estimated_usage').costMicroUsd,1200000);
 assert.equal(calculateCost('gpt-4o-transcribe-diarize',{audioSeconds:60}).basis,'estimated_usage');
});
test('missing, invalid, future-model usage is unknown, never zero or invoice confirmed',()=>{
 for(const [m,u] of [['future',{}],['gpt-6.1-sol',{}],['gpt-6.1-sol',{textInput:-1}],['gpt-6.1-sol',{textInput:NaN}]])assert.equal(calculateCost(m,u).costMicroUsd,null);
 assert.equal(recommendedCredits(null),null);
});
test('full catalogue, nearest-rank p95, retries, failures and margin alerts',()=>{
 const gens=Array.from({length:20},(_,i)=>({id:String(i),feature:'song',status:i===19?'failed':'success'}));
 const attempts=gens.map((g,i)=>({generationId:g.id,feature:'song',provider:'google',day:'2026-11-03',basis:'calculated_units',costMicroUsd:(i+1)*1000}));
 attempts.push({...attempts[0],costMicroUsd:500});
 const r=costReport(gens,attempts,{song:1}),f=r.features.find(f=>f.id==='song');assert.equal(r.features.length,21);assert.equal(AI_FEATURES.length,21);
 assert.equal(f.success,19);assert.equal(f.failed,1);assert.equal(f.p95MicroUsd,19000);assert.equal(f.maxMicroUsd,20000);assert.equal(f.recommendedCredits,8);assert.equal(f.alert,'below-cost');assert.equal(r.invoiceConfirmedMicroUsd,null);
 attempts.push({...attempts[0],costMicroUsd:null,basis:'unknown'});const bad=costReport(gens,attempts,{song:99}).features.find(f=>f.id==='song');assert.equal(bad.recommendedCredits,null);assert.equal(bad.alert,'incomplete');assert.equal(bad.margin,null);assert.equal(bad.profitMicroUsd,null);
});
test('no samples or no successes cannot claim a sustainable price',()=>{
 const empty=costReport([],[]);assert.ok(empty.features.every(f=>f.recommendedCredits===null));
 const r=costReport([{id:'x',feature:'song',status:'failed'}],[{generationId:'x',costMicroUsd:80000,provider:'google',day:'2026-11-03'}]);assert.equal(r.features.find(f=>f.id==='song').recommendedCredits,null);
});
test('settings reject unknown features, fractional credits, unsafe caps and stale version formats',()=>{
 const good={proposed:{song:32},dailyGlobalMicroUsd:1000000000,dailyTeacherMicroUsd:250000000,paused:false,version:0};assert.equal(validateSettings(good).version,1);
 for(const patch of [{proposed:{song:1.2}},{proposed:{x:1}},{dailyGlobalMicroUsd:0},{paused:'false'},{version:-1}])assert.throws(()=>validateSettings({...good,...patch}));
});

test('cross-midnight spend is scoped to calls while generation pricing retains the whole lifecycle',()=>{const g=[{id:'resume',feature:'lessonPlan',status:'success'}],old={generationId:'resume',provider:'openai',day:'2026-11-02',costMicroUsd:5000},today={...old,day:'2026-11-03',costMicroUsd:10000};const r=costReport(g,[old,today],{},[today]);assert.equal(r.calculatedMicroUsd,10000);assert.equal(r.features.find(f=>f.id==='lessonPlan').totalMicroUsd,15000);assert.equal(r.features.find(f=>f.id==='lessonPlan').recommendedCredits,6);assert.deepEqual(Object.keys(r.date),['2026-11-03']);});

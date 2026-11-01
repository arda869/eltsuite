import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {editUntilReady} from '../../functions/ai/editorial.js';
import {taskCatalogue} from '../../functions/ai/catalogue.js';
import {outlineSchema,generationSchema,validate} from '../../functions/ai/contract.js';
import {stageContract} from '../../functions/ai/sequence.js';
import {activitySchema,checkActivities,nativeTask} from '../../functions/ai/activities.js';
import {collectSources,relevantExtract} from '../../functions/ai/research.js';
import {prepareCommonsImage} from '../../functions/ai/commons.js';
const usage={inputTokens:12,outputTokens:30};
const review=(bad=false)=>({checks:Array.from({length:11},(_,i)=>({criterion:'criterion'+i,score:bad?2:4,evidence:'Specific evidence'})),criticalErrors:bad?['Task has no reason to listen']:[],suggestions:[]});
test('editorial repair fixes the final value, rechecks it and reserves every paid operation in order',async()=>{
 const events=[];let reviews=0;
 const result=await editUntilReady({value:{task:'generic'},deadline:Date.now()+90000,reserve:async kind=>events.push('reserve '+kind),
 review:async value=>{events.push('review '+value.task);return {value:review(++reviews===1),usage}},
 repair:async()=>{events.push('repair');return {value:{task:'decision'},usage}},check:value=>assert.equal(value.task,'decision')});
 assert.equal(result.value.task,'decision');assert.equal(result.repairs,1);assert.equal(result.usage.length,3);
 assert.deepEqual(events,['reserve review','review generic','reserve repair','repair','reserve review','review decision']);
});
test('failed reviews never release unfinished content; no calls after deadline or reservation failure',async()=>{
 let calls=0;const args={value:{},deadline:Date.now()+90000,reserve:async()=>{},review:async()=>{calls++;return {value:review(true),usage}},repair:async()=>({value:{},usage}),check:()=>{}};
 await assert.rejects(editUntilReady(args),e=>e.reason==='editorial');assert.equal(calls,3);
 calls=0;await assert.rejects(editUntilReady({...args,deadline:0}),e=>e.reason==='editorial');assert.equal(calls,0);
 await assert.rejects(editUntilReady({...args,reserve:async()=>{throw Error('budget')}}),/budget/);assert.equal(calls,0);
});
test('old outlines load; new outlines require concrete activities; malformed optional fields are rejected',()=>{
 const old={title:'A day in orbit',outcomes:['Compare routines'],methodology:'Skills',rationale:'Compare experiences',stages:[{id:'a',title:'Compare',aim:'Make a choice',interaction:'Pairs',minutes:20}]};
 validate(outlineSchema,old);assert.throws(()=>validate(generationSchema(outlineSchema),old));
 const next=structuredClone(old);Object.assign(next.stages[0],{activityType:'Speaking · information gap',learnerAction:'Ask a partner to find a shared free hour',material:'Separate A/B schedules',outcome:'Agree on a meeting time'});
 validate(generationSchema(outlineSchema),next);next.stages[0].learnerAction=42;assert.throws(()=>validate(outlineSchema,next));
});
test('the AI sees the complete insert catalogue, including timelines and collaboration tools',()=>{
 const source=readFileSync(new URL('../../src/editor/InsertGallery.tsx',import.meta.url),'utf8');
 const section=source.split('const ABOUT: Record<string, string> = {')[1].split('\n};')[0];
 const keys=[...section.matchAll(/^\s*(?:'([^']+)'|(\w+)):/gm)].map(m=>m[1]||m[2]);
 assert.deepEqual(taskCatalogue.map(t=>t.key),keys);
});
const sample=(s,root=s)=>s.$ref?sample(root.$defs[s.$ref.slice(8)],root):s.type==='object'?Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,sample(v,root)])):s.type==='array'?Array.from({length:s.minItems},()=>sample(s.items,root)):s.enum?s.enum[0]:s.type==='integer'?s.minimum:'Text';
test('highlighting keeps target groups private; timelines and diagrams become native bounded nodes',()=>{
 const plan={stages:[{id:'a',minutes:20}]},contract=stageContract('activities',activitySchema,plan),raw=sample(contract.schema);
 const t=raw.tasks.stage_1[0];Object.assign(t,{roles:[],versions:[],mediaPlan:[],blocks:[],definitions:[],subTasks:[],visuals:[],questions:[{format:'highlight',prompt:'Find the daily actions.',options:[],acceptedAnswers:[],answer:'She {{works}} here and {{cooks dinner}}.',explanation:'The highlighted phrases describe habits.'}],structures:[{kind:'timeline',title:'The expedition',labels:[],items:[{label:'2020 · Departure',text:''},{label:'2021 · Return',text:''}]},{kind:'compare',title:'Two routines',labels:[],items:[{label:'A',text:'—'},{label:'B',text:'—'}]}]});
 const output=contract.decode(raw);checkActivities(output,plan);const native=nativeTask(output.tasks[0],0);
 assert.ok(native.content.content.some(n=>n.type==='timeline'));assert.ok(native.content.content.some(n=>n.type==='diagram'));
 const highlight=native.content.content.find(n=>n.type==='pq');assert.deepEqual(highlight.attrs.data.toks,['She','works','here','and','cooks','dinner','.']);
 assert.deepEqual(native.key[highlight.attrs.id].k.groups,[[1],[4,5]]);assert.ok(!JSON.stringify(native.content).includes('groups'));assert.ok(!JSON.stringify(native.content).includes('{{'));
});
test('research failure is explicit; sources contain actual fetched extracts and canonical links',async()=>{
 const fetchImpl=async url=>({ok:true,text:async()=>JSON.stringify(url.searchParams.has('list')?{query:{search:[{pageid:1}]}}:{query:{pages:[{title:'Expedition',fullurl:'https://en.wikipedia.org/wiki/Expedition',extract:'Documented evidence. '.repeat(15)}]}})});
 const sources=await collectSources(['Expedition'],fetchImpl);assert.equal(sources.length,1);assert.match(sources[0].extract,/Documented evidence/);
 await assert.rejects(collectSources(['none'],async()=>({ok:false})),e=>e.reason==='research');
});
test('Commons image selection cannot substitute a caption for visual inspection or accept an unmatched image',async()=>{
 const jpeg=Buffer.alloc(120);jpeg[0]=255;jpeg[1]=216;
 const fetchImpl=async url=>String(url).startsWith('https://commons.')?{ok:true,text:async()=>JSON.stringify({query:{pages:[{pageid:1,title:'File:Space.jpg',imageinfo:[{mime:'image/jpeg',thumburl:'https://upload.wikimedia.org/space.jpg',extmetadata:{Artist:{value:'Photographer'},LicenseShortName:{value:'CC BY 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by/4.0/'}}}]}]}})}:new Response(jpeg,{headers:{'content-type':'image/jpeg'}});
 let sawImages=false;
 const generate=async args=>{sawImages=args.sourceImages[0].startsWith('data:image/jpeg;base64,');return {value:{selection:1,alt:'Astronaut exercising',reason:'The equipment and action are visible.'},usage}};
 const result=await prepareCommonsImage({prompt:'astronaut exercise'},{generate,apiKey:'test',model:'gpt-6.1-sol',fetchImpl});assert.ok(sawImages);assert.match(result.credit,/CC BY 4.0/);assert.match(result.credit,/curid=1/);
 await assert.rejects(prepareCommonsImage({prompt:'astronaut exercise'},{generate:async args=>({value:args.name==='image_search'?{query:'astronaut exercising'}:{selection:0}}),fetchImpl}),/No photograph passed/);
});

test('research retrieves the relevant routine section instead of repeated introductory names',()=>{
 const intro='The International Space Station is an international scientific station. '.repeat(8);
 const routine='A typical day begins at 06:00. The crew exercise, carry out experiments and eat together. '.repeat(7);
 const unrelated='The International Space Station has many international partner agencies and station modules. '.repeat(12);
 const extract=relevantExtract(intro+'\n== Station construction ==\n'+unrelated+'\n== Daily routines ==\n'+routine,['International Space Station daily routine']);
 assert.match(extract,/A typical day begins at 06:00/);assert.ok(extract.length<=3500);
});

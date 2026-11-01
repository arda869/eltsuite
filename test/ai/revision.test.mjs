import test from 'node:test';
import assert from 'node:assert/strict';
import {applyRevision,revisionInput,outlineFromPlan} from '../../functions/ai/revision.js';
import {outlineSchema} from '../../functions/ai/contract.js';
const outline={title:'A strange working day',outcomes:['Compare routines'],methodology:'Task-based',rationale:'My manually edited rationale — keep this.',stages:[{id:'read',title:'Read and decide',aim:'Choose a routine',minutes:60,interaction:'Pairs'}],sourceEvidence:[{title:'Station',url:'https://en.wikipedia.org/wiki/International_Space_Station',extract:'Verified evidence'}]};
const brief={duration:60};
test('targeted revisions preserve all unmentioned content and manual edits byte-for-byte',()=>{
 const before=JSON.stringify(outline),patch={summary:'A stronger title',changes:[{path:'/title',valueJson:JSON.stringify('Sixteen sunrises, one working day')}]};
 const result=applyRevision(outline,patch,outlineSchema);
 assert.equal(JSON.stringify(outline),before);assert.equal(result.title,'Sixteen sunrises, one working day');
 assert.deepEqual({...result,title:outline.title},outline);
 assert.deepEqual(revisionInput({action:'outline',revision:{instructions:'  Change only the title.  ',current:outline}},brief).current,outline);
});
test('invalid or unsafe revision fails atomically without changing current draft or evidence',()=>{
 const before=JSON.stringify(outline);
 for(const path of ['/sourceEvidence','/__proto__/polluted','/stages/0/constructor','/missing','/stages/99/title'])assert.throws(()=>applyRevision(outline,{summary:'Unsafe',changes:[{path:'/title',valueJson:'"Temporary"'},{path,valueJson:'"bad"'}]},outlineSchema));
 assert.throws(()=>applyRevision(outline,{summary:'Bad shape',changes:[{path:'/stages',valueJson:'[]'}]},outlineSchema));
 assert.equal(JSON.stringify(outline),before);assert.equal({}.polluted,undefined);
 for(const instructions of ['', ' ', 'x'.repeat(2001)])assert.throws(()=>revisionInput({action:'outline',revision:{instructions,current:outline}},brief));
});
test('a reopened plan supplies its own approved sequence for revisions',()=>{
 const plan={...outline,mainAim:'Compare routines',stages:outline.stages.map(s=>({...s,procedures:'A manual procedure.'}))};
 const result=outlineFromPlan(plan);assert.deepEqual(result.stages,outline.stages);assert.deepEqual(result.outcomes,['Compare routines']);assert.deepEqual(result.sourceEvidence,outline.sourceEvidence);
});
test('an invalid revision is repaired automatically without mutating the teacher version',async()=>{
 const {generateChecked}=await import('../../functions/ai/recovery.js');let calls=0,reservations=0;
 const result=await generateChecked({args:{input:{},instructions:'Revise'},generate:async()=>({usage:{inputTokens:1,outputTokens:1},value:{summary:'Rename',changes:[{path:++calls===1?'/missing':'/title',valueJson:'"Revised"'}]}}),decode:p=>applyRevision(outline,p,outlineSchema),check:()=>{},reserveRepair:async()=>reservations++});
 assert.equal(calls,2);assert.equal(reservations,1);assert.equal(result.value.title,'Revised');assert.equal(outline.title,'A strange working day');assert.equal(result.value.rationale,outline.rationale);
});

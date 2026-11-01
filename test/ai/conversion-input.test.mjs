import test from 'node:test';import assert from 'node:assert/strict';
import {conversionInput} from '../../functions/ai/conversion-input.js';
test('conversion removes only duplicated metadata and retains every learner resource and private key',()=>{
 const slot={slot:'stage_1',id:'s1',title:'Discover',aim:'Infer',minutes:15,interaction:'pairs',material:'Story'};
 const stage={...slot,procedures:'Read, then compare.',materialIds:['m1'],instructions:'Find the evidence.',answerKey:'Private key'};delete stage.slot;
 const payload={approvedPlan:{title:'A mystery',stages:[stage],learnerMaterials:[{id:'m1',task:'The complete story',script:'Complete dialogue',answerKey:'All answers'}]},sourceEvidence:[{title:'Source',url:'https://example.com',extract:'Long verified evidence'}]};
 const before=structuredClone(payload),result=conversionInput(payload,[slot]);
 assert.deepEqual(payload,before);assert.deepEqual(result.approvedPlan.learnerMaterials,payload.approvedPlan.learnerMaterials);
 assert.deepEqual({...slot,...result.approvedPlan.stages[0]}, {...slot,...stage});
 assert.deepEqual(result.sourceAttributions,[{title:'Source',url:'https://example.com'}]);
 assert.equal('sourceEvidence' in result,false);assert.equal(payload.sourceEvidence[0].extract,'Long verified evidence');
});

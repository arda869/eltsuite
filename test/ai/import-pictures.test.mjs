import test from 'node:test';
import assert from 'node:assert/strict';
import {pictureRecipe} from '../../functions/ai/import-picture-job.js';
import {importPicturePlans,taskPictureIds,resolveImportPictures} from '../../functions/ai/import-pictures.js';
import {checkRebuild,nativeImportInstructions} from '../../functions/ai/material-contract.js';
import {importElements,importLesson,asImportModel} from './import-types-fixture.mjs';
import {importModelSchema} from '../../functions/ai/import-model.js';
import {checkRequestSize} from '../../functions/ai/budget.js';
import {nativeTask} from '../../functions/ai/activities.js';
import {senseCheckImport} from '../../functions/ai/import-review.js';
test('picture crops are bounded, cache IDs are stable and changed source regions get new IDs',()=>{
 const p=importElements.picture.data,a=pictureRecipe(p);assert.equal(a.id,pictureRecipe({...p,asset:'a'.repeat(64)}).id);assert.notEqual(a.id,pictureRecipe({...p,x:11}).id);
 for(const patch of [{x:99},{ref:'../../private'},{sourceImage:7},{width:0},{height:101}])assert.throws(()=>pictureRecipe({...p,...patch}));
});
test('picture references remain real native images and resolve only through trusted class-media mappings',()=>{
 const p=structuredClone(importElements.picture);p.data.asset=pictureRecipe(p.data).id;const label={...importElements['pq-label'],data:{...importElements['pq-label'].data,image:'picture:'+p.data.ref}};
 const rebuilt=checkRebuild(importLesson([p,label]),'item',{training:false}),plans=importPicturePlans(rebuilt),n=nativeTask(rebuilt.tasks[0],0,'pic');assert.deepEqual(taskPictureIds(rebuilt.tasks[0],plans),[p.data.asset]);
 const resolved=resolveImportPictures(n.content,plans,{[p.data.asset]:'media:trusted_class_image'});assert.ok(JSON.stringify(resolved).includes('media:trusted_class_image'));assert.ok(!JSON.stringify(resolved).includes('import-picture:'));assert.ok(!JSON.stringify(resolved).includes('picture:'+p.data.ref));
 assert.throws(()=>checkRebuild(importLesson([p,p]),'item',{training:false}),/distinct/);assert.throws(()=>checkRebuild(importLesson([label]),'item',{training:false}),/not included/);
});
test('a model pass never overrides an unsuccessful picture comparison, and label positions require review',async()=>{
 const p=structuredClone(importElements.picture);p.data.asset=pictureRecipe(p.data).id;
 const run=async o=>({value:{tasks:o.input.tasks.map(t=>({stageId:t.stageId,summary:'Source task checked.',issues:[]}))}});
 for(const passed of [true,false]){
  const source={name:'Shapes',text:'Look at the picture.',images:[],scope:'item',instructions:'',pictureChecks:[{id:p.data.asset,ref:p.data.ref,passed,summary:'Comparison result.',issues:[]}]};
  const r=await senseCheckImport({rebuilt:importLesson([p]),source,training:false,run});assert.equal(r.checks[0].status,passed?'passed':'needsReview');
  const label={...importElements['pq-label'],data:{...importElements['pq-label'].data,image:'picture:'+p.data.ref}};
  const labelled=await senseCheckImport({rebuilt:importLesson([p,label]),source,training:false,run});assert.equal(labelled.checks[0].status,'needsReview');assert.ok(labelled.checks[0].issues.some(i=>/label positions/.test(i.problem)));
 }
});
test('a source-based question repair retains a prepared illustration when its recipe is unchanged',async()=>{
 const p=structuredClone(importElements.picture);p.data.asset=pictureRecipe(p.data).id;let checked=0;
 const source={name:'Shapes',text:'Look at the picture.',images:[],scope:'item',instructions:'',pictureChecks:[{id:p.data.asset,passed:true}]};
 const r=await senseCheckImport({rebuilt:importLesson([p]),source,training:false,run:async o=>o.name==='importRepair'?{value:asImportModel(importLesson([importElements.picture]))}:{value:{tasks:o.input.tasks.map(t=>({stageId:t.stageId,summary:'Source checked.',issues:checked++?[]:[{problem:'Unclear instruction.',sourceEvidence:'Look at the picture.',improvement:'Use the source instruction.'}]}))}}});
 assert.equal(r.rebuilt.tasks[0].inlineElements[0].data.asset,p.data.asset);assert.equal(r.checks[0].status,'repaired');
});
test('complete native schema with maximum ASCII source remains inside the provider request budget',()=>{
 const schema=importModelSchema(true);checkRequestSize({model:'gpt-6.1-sol',schema,instructions:nativeImportInstructions,input:{sourceText:'a'.repeat(30000),scope:'item',creationType:'lesson',instructions:''}});
 assert.deepEqual(schema.$defs.importElement.anyOf.find(b=>b.properties.kind.enum[0]==='picture').properties.asset.enum,['']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readable,aggregateTaskResults,digest} from '../../functions/intelligence/context.js';
import {checkAdvice,generatorBrief,intelligenceInstructions} from '../../functions/intelligence/contract.js';
const context={classId:'class-a',sourceVersion:'v1',sources:[{id:'class'},{id:'lesson:one'}]};
const option={title:'Compare two journeys',objectives:'Ask questions to fill a genuine information gap.',activityType:'Pair information gap',learnerAction:'Compare private route cards and choose a meeting place.',interaction:'Pairs',minutes:45,sequence:['Read the map','Ask about missing details','Agree a meeting place'],rationale:'Use the taught question forms to solve a new problem.',differentiation:'Optional question prompts, then remove them.',transition:'Use the previous reading as the shared setting.',evidenceIds:['lesson:one']};
const advice={summary:'A purposeful next step.',findings:[],options:[option,{...option,title:'Make a personal recommendation'}],limitations:[]};
test('protected generator prompts, schemas and configuration remain byte-identical to the archived production baseline',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./generator-baseline.json',import.meta.url)));
 for(const [path,sha] of Object.entries(baseline.files))assert.equal(createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex'),sha,path);
 assert.equal(baseline.qualityGate.liveAcceptanceVerified,false,'Do not silently mark unperformed live checks as passed');
});
test('advice rejects fabricated or excluded citations and requires distinct option slots',()=>{
 assert.equal(checkAdvice(advice,context,'nextLesson'),advice);
 assert.throws(()=>checkAdvice({...advice,options:[{...option,evidenceIds:['other-class:private']},option]},context,'nextLesson'));
 assert.throws(()=>checkAdvice({...advice,options:[option]},context,'nextLesson'));
 assert.throws(()=>checkAdvice({...advice,findings:[{title:'Claim',kind:'concern',observation:'Unsupported',reasoning:'No evidence',evidenceIds:[],confidence:'tentative'}]},context,'profile'));
});
test('the generator adapter transfers only an editable bounded brief, never prompts or raw learner evidence',()=>{
 const result=generatorBrief({...option,rawLearnerAnswer:'PRIVATE'},context);
 assert.equal(result.version,1);assert.equal(result.classId,'class-a');assert.equal(result.brief.duration,45);
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(Object.hasOwn(result,'instructions'),false);assert.equal(result.brief.methodology,'Recommend');
});
test('text extraction excludes media URLs, credentials and author metadata',()=>{
 const n={type:'doc',attrs:{secret:'PRIVATE'},content:[{type:'paragraph',content:[{type:'text',text:'Read the story.'}]},{type:'picture',attrs:{url:'PRIVATE',alt:'A city street'}}]};
 assert.equal(readable(n),'Read the story. A city street');assert.ok(!readable(n).includes('PRIVATE'));
});
test('performance aggregation uses marked answers, not missing submissions or arbitrary total fields',()=>{
 const content={type:'doc',content:[{type:'paragraph',content:[{type:'gap',attrs:{id:'q'}}]}]};
 const tasks=new Map([['one/task',{content,key:{q:{kind:'gap',answers:['went']}}}]]);
 const out=aggregateTaskResults([{itemId:'one',taskId:'task',learnerUid:'PRIVATE',checked:true,responses:{q:'went'},score:999,total:999},{itemId:'one',taskId:'task',checked:true,responses:{}},{itemId:'one',taskId:'task',checked:false,responses:{q:'wrong'}},{itemId:'another-class',taskId:'task',checked:true,responses:{q:'went'}}],tasks);
 assert.equal(out.length,1);assert.equal(out[0].markedSubmissions,1);assert.equal(out[0].score,out[0].total);assert.ok(out[0].total>0&&out[0].total<999);assert.ok(!JSON.stringify(out).includes('PRIVATE'));
});
test('shared evaluation guidance retains uncertainty, first-lesson age distinctions and teacher control',()=>{
 for(const term of ['Missing work is unknown','never change their work','AGE','teacher-recorded coverage','no learner rankings'])assert.ok(intelligenceInstructions.includes(term),term);
 assert.notEqual(digest({lesson:'v1'}),digest({lesson:'v2'}));
});

test('source and edit versions are stable across Firestore object key ordering',()=>{assert.equal(digest({b:2,a:{y:1,x:3}}),digest({a:{x:3,y:1},b:2}));});

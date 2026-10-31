import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrainingProfile, trainingActivitySchema } from '../../functions/ai/training.js';
import { validateBrief, validate } from '../../functions/ai/contract.js';
import { checkActivities,nativeTask } from '../../functions/ai/activities.js';
const profile={programme:'TKT',stage:'In-service',experience:'Two to five years',goals:'Prepare for Module 2',context:'Primary teachers',focus:'Module 2',examDate:'2026-12-01'};
test('training profiles and briefs distinguish teaching experience from language level',()=>{
 assert.deepEqual(validateTrainingProfile({...profile,privateName:'not forwarded'}),profile);
 assert.throws(()=>validateTrainingProfile({...profile,programme:'unknown'}));
 const b={topic:'Checking understanding',objectives:'Design useful checking questions',context:'Novice teachers',duration:45,level:'Foundation',methodology:'Experiential input'};
 assert.equal(validateBrief(b,true).level,'Foundation');assert.throws(()=>validateBrief(b));assert.throws(()=>validateBrief({...b,level:'B1'},true));
});
test('training forms are native completion tools and cannot enter language conversion',()=>{
 const t={stageId:'s',title:'Rehearse checking',format:'speaking',trainingTool:'rehearsal',minutes:15,instructions:'Rehearse, collect evidence and retry.',input:'A teacher asks Do you understand after giving six instructions.',teacherOnlyInput:'Model a shorter instruction and check the task.',roles:[],blocks:[],subTasks:[],visuals:[],versions:[],questions:[{format:'discussion',acceptedAnswers:[],prompt:'What would you change?',options:[],answer:'Shorten and sequence the instructions.',explanation:'Check what learners will do.'}],teacherNotes:'Observe the rehearsal.',support:'',challenge:''};
 const value={title:'Checking instructions',rationale:'Experience and analysis',differentiation:'No prior evidence',recycling:'No history',tasks:[t]},plan={stages:[{id:'s',minutes:15}]};
 validate(trainingActivitySchema,value);checkActivities(value,plan,true);assert.throws(()=>checkActivities(value,plan,false));
 const n=nativeTask(t,0);assert.ok(n.content.content.some(x=>x.type==='tt'&&x.attrs.kind==='rehearsal'&&x.attrs.mode==='complete'));assert.ok(!JSON.stringify(n.content).includes(t.teacherOnlyInput));
 assert.throws(()=>checkActivities({...value,tasks:[{...t,trainingTool:'arbitrary'}]},plan,true));
});

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
import {teachingCoach} from '../functions/ai/coach.js';
import {findTeacherLessons} from '../functions/ai/coach-lessons.js';
const app=initializeApp({projectId:'demo-coach-history'}),db=getFirestore(app);
try{
 await db.doc('users/service-teacher').set({role:'teacher'});
 await db.doc('teachingCoach/service-teacher/settings/profile').set({qualifications:'None',experience:'3–5',roles:['Teacher'],context:'Adults at B1',beliefs:'Meaningful practice helps learners.',version:1});
 await db.doc('teachingCoach/service-teacher/settings/context').set({forms:false});
 for(const [id,teacherId,coTeachers] of [['owned','service-teacher',{}],['shared','other',{'service-teacher':{role:'co'}}],['foreign','other',{}]]){
  await db.doc('classes/'+id).set({teacherId,coTeachers,name:id,level:'B1'});
  await db.doc(`classes/${id}/items/lesson`).set({title:'Clear classroom instructions',type:'lesson',order:1});
  await db.doc(`classes/${id}/items/lesson/tasks/task`).set({title:'Demonstrate a pair task',kind:'task',order:0,instructions:'Watch the example.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:id+' private material about demonstration'}]}]}});
 }
 const found=await findTeacherLessons(db,'service-teacher','clear instructions');
 assert.equal(found.lessons.length,2);assert.match(JSON.stringify(found),/owned private material/);assert.match(JSON.stringify(found),/shared private material/);assert.doesNotMatch(JSON.stringify(found),/foreign private material/);
 await db.doc('classes/shared').update({coTeachers:{}});assert.equal((await findTeacherLessons(db,'service-teacher','instructions')).lessons.length,1);
 let calls=0;const generated={value:{reply:'Try a short demonstration before the pair task.',journalDraft:''},usage:{inputTokens:100,outputTokens:30}};
 let sent;const options={apiKey:'unused-test-value',model:'gpt-6.1-sol',enabled:'true',generateReply:async args=>{sent=args.input;calls++;return generated;}};
 const base={auth:{uid:'service-teacher',token:{email:'teacher@example.com'}},data:{action:'coach',conversationId:'history-one',requestId:'first',mode:'Reflect with me',prompt:'How can I make instructions clearer?',history:[],entryId:'',researchId:'',useProfile:true,useBeliefs:true}};
 const result=await teachingCoach(base,options);
 assert.match(JSON.stringify(sent.context.relatedLessons),/owned private material/);
 const root=db.doc('teachingCoach/service-teacher/conversations/history-one'),turn=root.collection('turns').doc('first');
 assert.equal((await turn.get()).get('result.reply'),result.reply);assert.equal((await turn.get()).get('prompt'),base.data.prompt);assert.equal((await turn.get()).get('status'),'completed');
 await teachingCoach(base,options);assert.equal(calls,1);assert.equal((await root.get()).get('turnCount'),1);
 let release;const pending=teachingCoach({...base,data:{...base.data,requestId:'second',prompt:'Would a demonstration help?'}},{...options,generateReply:()=>new Promise(r=>{release=()=>r(generated);})});
 for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,25));assert.ok(release);
 assert.equal((await root.collection('turns').doc('second').get()).get('status'),'running');
 await assert.rejects(teachingCoach({...base,data:{...base.data,requestId:'parallel'}},options),/already replying/);
 release();await pending;assert.equal((await root.get()).get('activeRequest'),'');
 await assert.rejects(teachingCoach({...base,data:{...base.data,requestId:'failed'}},{...options,generateReply:async()=>{throw Error('simulated provider outage');}}));
 assert.equal((await root.collection('turns').doc('failed').get()).get('status'),'failed');assert.equal((await root.get()).get('activeRequest'),'');
 await teachingCoach({...base,data:{...base.data,requestId:'followup',prompt:'Please suggest one instruction.'}},options);
 assert.equal((await root.collection('turns').get()).size,4);
 await db.doc('teachingCoach/service-teacher/settings/context').set({forms:false,lessons:false,version:2});
 await teachingCoach({...base,data:{...base.data,requestId:'optout'}},options);assert.equal(sent.context.relatedLessons,undefined);assert.equal(sent.context.lesson,undefined);
 await assert.rejects(teachingCoach({...base,data:{...base.data,requestId:'selected-optout',lessonContext:{classId:'owned',itemId:'lesson'}}},options),/switched off/);
 console.log('PASS default discovery reads owned/co-taught lesson content, excludes foreign classes, respects revoked access and lesson opt-out.');
 console.log('PASS real service transactions: durable prompt/reply with blank optional fields, idempotent retry, running-turn recovery, concurrent-send rejection, failure preservation and follow-up. AI provider simulated.');
}finally{await deleteApp(app);}

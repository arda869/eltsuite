import {questionIds,scoreQuestion,isAnswered} from './question-core.js';
import {summariseEvidence} from './evidence.js';
const plain=n=>typeof n==='string'?n:(n?.text??'')+(n?.content??[]).map(plain).join(' ');
export async function collectLearningEvidence(db,classId,{itemId,taskId,sessionStart,sessionEnd}={}) {
 const cls=db.collection('classes').doc(classId);
 const [learners,answers]=await Promise.all([cls.collection('learners').get(),cls.collection('answers').orderBy('updatedAt','desc').limit(300).get()]);
 const taskCache=new Map();
 const getTask=async(item,task)=>{const id=item+'/'+task;if(!taskCache.has(id))taskCache.set(id,(async()=>{const ref=cls.collection('items').doc(item).collection('tasks').doc(task);const [s,b,k]=await Promise.all([ref.get(),ref.collection('private').doc('body').get(),ref.collection('private').doc('key').get()]);return {title:s.get('title')??'Activity',instructions:s.get('instructions')??'',content:s.get('restricted')?b.get('content'):s.get('content'),key:k.data()??{}};})());return taskCache.get(id);};
 const records=[];
 for(const snapshot of answers.docs){const a=snapshot.data();if(!a.itemId||!a.taskId||!a.learnerUid)continue;if(sessionStart&&(a.itemId!==itemId||((a.updatedAt?.toMillis?.()??0)<sessionStart||(a.updatedAt?.toMillis?.()??0)>(sessionEnd??Infinity))))continue;
 const t=await getTask(a.itemId,a.taskId);if(!t.content)continue;
 const telemetry=(await cls.collection('learningEvidence').doc(snapshot.id).get()).data();
 const qs=questionIds(t.content,a.responses??{}).map(q=>{const response=a.responses?.[q.id],answered=isAnswered(response),score=answered&&a.checked?scoreQuestion(t.key[q.id],response):{got:0,max:0};return {id:q.id,type:q.type,answered,marked:score.max>0,correct:score.got,possible:score.max,...(telemetry?.questions?.[q.id]??{}),activeMs:a.engagement?.questions?.[q.id]?Math.max(0,Math.min(86400000,Number(a.engagement.questions[q.id].activeMs)||0)):null};});
 records.push({id:snapshot.id,learnerUid:a.learnerUid,itemId:a.itemId,taskId:a.taskId,title:t.title,instruction:t.instructions.slice(0,250),context:plain(t.content).slice(0,400),checked:!!a.checked,score:qs.reduce((n,q)=>n+q.correct,0),total:qs.reduce((n,q)=>n+q.possible,0),questions:qs.slice(0,16),submittedAt:a.submittedAt??null,submissions:telemetry?.submissions??null,observedSince:telemetry?.observedSince?.toMillis?.()??null,activeMs:a.engagement?.version===1?Math.max(0,Math.min(86400000,Number(a.engagement.activeMs)||0)):null});
 }
 let targets=[];
 if(itemId&&!sessionStart){const tasks=await cls.collection('items').doc(itemId).collection('tasks').orderBy('order').get();for(const s of tasks.docs){if(s.get('kind')==='section'||(taskId&&s.id!==taskId)||(!taskId&&s.get('family')&&s.get('family')!==s.id))continue;const t=await getTask(itemId,s.id);targets.push({id:s.id,title:t.title,instructions:t.instructions,content:t.content});}}
 return {targets,learners:learners.docs.map((s,i)=>{const own=records.filter(r=>r.learnerUid===s.get('authUid'));return {id:s.id,code:'L'+(i+1),name:s.get('displayName')??'Learner',summary:summariseEvidence(own),records:own.slice(0,8)};}),sampleLimit:300};
}

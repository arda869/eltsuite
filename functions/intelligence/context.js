import {createHash} from 'node:crypto';
import {questionIds,scoreQuestion,isAnswered} from '../learning/question-core.js';
export const VERSION='lesson-intelligence-v1';
const canonical=v=>v?.toMillis?{timestamp:v.toMillis()}:Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v??null;
export const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const text=(v,n=1500)=>typeof v==='string'?v.slice(0,n):'';
const fields=(value,keys)=>Object.fromEntries(keys.map(k=>[k,text(value?.[k],1500)]));
const date=v=>v?.toMillis?.()??(Number.isFinite(v)?v:null);
// Exclude links, media credentials, author metadata and embedded learner responses.
export function readable(node,depth=0){if(depth>24||!node)return '';if(typeof node==='string')return text(node,12000);return [text(node.text,12000),text(node.attrs?.instruction,1000),text(node.attrs?.alt,500),...(Array.isArray(node.content)?node.content.map(n=>readable(n,depth+1)):[])].filter(Boolean).join(' ').slice(0,18000);}
export function aggregateTaskResults(answers,tasks){
 const out=new Map();
 for(const a of answers){const task=tasks.get(a.itemId+'/'+a.taskId);if(!task||!a.checked)continue;const score=questionIds(task.content,a.responses??{}).reduce((s,q)=>{if(!isAnswered(a.responses?.[q.id]))return s;const r=scoreQuestion(task.key[q.id],a.responses[q.id]);return {got:s.got+r.got,max:s.max+r.max};},{got:0,max:0});
 if(!score.max)continue;const k=a.itemId+'/'+a.taskId,r=out.get(k)??{itemId:a.itemId,taskId:a.taskId,markedSubmissions:0,score:0,total:0,latest:null};r.markedSubmissions++;r.score+=score.got;r.total+=score.max;r.latest=Math.max(r.latest??0,date(a.submittedAt)??0)||null;out.set(k,r);}
 return [...out.values()];
}
export async function intelligenceContext(db,cls,{itemId='',taskId='',excluded=[]}={}){
 const [items,answers,reports,confirmations,learners]=await Promise.all([
 cls.ref.collection('items').orderBy('createdAt','desc').limit(24).get(),
 cls.ref.collection('answers').orderBy('updatedAt','desc').limit(300).get(),
 cls.ref.collection('learningReports').orderBy('createdAt','desc').limit(60).get(),
 cls.ref.collection('intelligenceLessons').limit(60).get(),cls.ref.collection('learners').get()]);
 const selected=itemId?await cls.ref.collection('items').doc(itemId).get():null;
 if(itemId&&!selected.exists)throw Error('This lesson is no longer available.');
 const list=[...items.docs].sort((a,b)=>Number(b.id===itemId)-Number(a.id===itemId));if(selected&&!list.some(s=>s.id===itemId))list.unshift(selected);
 const confirmed=new Map(confirmations.docs.map(s=>[s.id,s.data()]));
 const ended=new Map(reports.docs.filter(s=>s.get('kind')==='progress'&&s.get('sessionEnd')).map(s=>[s.get('itemId'),s.get('sessionEnd')]));
 const tasks=new Map(),sources=[{id:'class',kind:'class',title:cls.get('name')??'Class',date:date(cls.get('updatedAt')),confidence:'teacher-recorded',url:`/class/${cls.id}`,data:{level:text(cls.get('level'),100),kind:cls.get('kind')??'language',profile:fields(cls.get('learningProfile'),['ageGroup','courseType','goals','needs']),trainingProfile:cls.get('kind')==='training'?fields(cls.get('trainingProfile'),['programme','stage','experience','goals','context','focus','examDate']):null,classSize:learners.size,syllabus:text(cls.get('syllabus')),modality:text(cls.get('modality'),100),duration:cls.get('lessonDuration')??null}}];
 const lessons=[];let readingBudget=22000;const truncations=[];
 for(const item of list){
 const docs=await item.ref.collection('tasks').orderBy('order').limit(40).get();
 const rows=await Promise.all(docs.docs.filter(s=>s.get('kind')!=='section'&&(!s.get('family')||s.get('family')===s.id)).map(async s=>{const [b,k,n]=await Promise.all([s.ref.collection('private').doc('body').get(),s.ref.collection('private').doc('key').get(),s.ref.collection('private').doc('notes').get()]);const content=s.get('restricted')?b.get('content'):s.get('content');tasks.set(item.id+'/'+s.id,{content,key:k.data()??{}});return {id:s.id,title:text(s.get('title'),160),instructions:text(s.get('instructions'),2000),text:readable(content),notes:text(n.get('text'),3000),minutes:s.get('minutes')??null,order:s.get('order')??0};}));
 const confirmation=confirmed.get(item.id),completed=!!confirmation?.completedAt||ended.has(item.id);
 const scoped=rows.filter((_,i)=>!taskId||item.id!==itemId||Math.abs(i-rows.findIndex(t=>t.id===taskId))<=1);
 const visible= (item.id===itemId?scoped:rows.slice(0,8)).map(({text:body,notes,...r})=>{if(item.id!==itemId)return {...r,instructions:r.instructions.slice(0,120)};const room=Math.max(0,Math.min(body.length,readingBudget));readingBudget-=room;if(room<body.length)truncations.push(r.title);return {...r,text:body.slice(0,room),notes:notes.slice(0,1500)};});
 const lesson={id:item.id,title:text(item.get('title'),160),completed,completionBasis:confirmation?.completedAt?'teacher-confirmed':ended.has(item.id)?'recorded teaching session':'unknown',aims:text(confirmation?.aims,2000),teacherNote:text(confirmation?.note,2000),coverage:confirmation?.coverage??[],tasks:visible};lessons.push(lesson);
 sources.push({id:'lesson:'+item.id,kind:'lesson',title:lesson.title,date:date(confirmation?.completedAt)??ended.get(item.id)??date(item.get('updatedAt'))??date(item.get('createdAt')),confidence:completed?'recorded':'draft',url:`/class/${cls.id}/lesson/${item.id}`,data:lesson});
 }
 if(taskId&&!lessons.find(l=>l.id===itemId)?.tasks.some(t=>t.id===taskId))throw Error('Select an available activity.');
 for(const r of aggregateTaskResults(answers.docs.map(s=>s.data()),tasks).slice(0,40))sources.push({id:'result:'+r.itemId+':'+r.taskId,kind:'performance',title:(lessons.find(l=>l.id===r.itemId)?.tasks.find(t=>t.id===r.taskId)?.title??'Activity')+' · recorded results',date:r.latest,confidence:'recorded',url:`/class/${cls.id}/lesson/${r.itemId}`,data:r});
 const allowed=new Set(sources.map(s=>s.id));if(!Array.isArray(excluded)||excluded.length>150||excluded.some(s=>!allowed.has(s)))throw Error('Refresh the available sources before changing the selection.');
 const included=sources.filter(s=>!excluded.includes(s.id));
 const context={version:VERSION,classId:cls.id,className:cls.get('name')??'Class',scope:{itemId,taskId},sources:included,availableSources:sources.map(({data,...s})=>s),completedLessons:lessons.filter(l=>l.completed&&!excluded.includes('lesson:'+l.id)).length,coverage:{lessonSample:items.size,answerSample:answers.size,reportSample:reports.size,bounded:true},limitations:[...(truncations.length?['Some long activities were excerpted: '+truncations.join(', ')+'. Evaluate a single activity for a closer review.']:[]),'Images and audio were not visually or audibly inspected in this text review. Private keys were used for scoring, not included as reviewed answer-key material.','Only recorded teaching sessions or teacher confirmation count as completed lessons.','Taught content is not evidence of learning. Missing or unsubmitted work is unknown.','Scores are aggregated within each activity; task difficulty, attendance and marking coverage can differ.','History is a bounded sample, not a complete curriculum audit. No individual learner ranking or automatic mastery label.']};
 return {...context,sourceVersion:digest(context)};
}

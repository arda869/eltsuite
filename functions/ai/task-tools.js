import { mergeKey } from './import-question-core.js';
import { activityMainInstruction } from './activities.js';
import { editableTaskFields, editSchema, applyTaskTextEdits, editInstructions } from './task-edit.js';
import { GenerationError } from './errors.js';
import { generateChecked } from './recovery.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { createHash, randomUUID } from 'node:crypto';
import { generate } from './provider.js';
import { activitySchema, activityInstructions, checkActivities, nativeTask, taskCreationSchema, taskCreationCatalogue } from './activities.js';
import { taskMediaContext, checkTaskMediaPlan, prepareActivityAssets, taskMediaGuidance } from './task-media.js';
import { mediaRequests } from './media-contract.js';
import { trainingActivityInstructions, trainingActivitySchema } from './training.js';
import { contentReviewStandard } from './pedagogy.js';
import { usageContext, chargeFeature } from './feature-usage.js';
import { reserveBudget, settleBudget, checkModel } from './budget.js';
import { encodeGenerationResult, readGenerationResult } from './storage.js';
import { taskQuestions, hasAnswer, checkedKey, keyInstructions } from './task-keys.js';
const id=s=>typeof s==='string'&&/^[\w-]{1,100}$/.test(s);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const text={type:'string',maxLength:2500};
const array=(items,maxItems=100)=>({type:'array',items,maxItems});
const ideasSchema=obj({ideas:{...array(obj({title:text,reason:text,direction:text,kind:{type:'string',enum:['support','challenge','next']}}),2),minItems:2}});
const keysSchema=obj({entries:array(obj({taskId:text,questionId:text,answerJson:{type:'string',maxLength:18000},reason:text})),issues:array(text,30)});
function retainedMedia(content) {
 const nodes=[];const walk=n=>{if(['picture','media','dialogue'].includes(n?.type)){nodes.push(n.type==='picture'?{type:'paragraph',content:[n]}:n);return;}for(const c of n?.content??[])walk(c);};walk(content);return nodes;
}
function previewNative(result) {const native=nativeTask(result.activity,0);if(result.retainedMedia?.length)native.content.content.unshift(...result.retainedMedia);return native;}
const fail=message=>{throw new HttpsError('failed-precondition',message);};
async function sources(item) {
 const list=await item.collection('tasks').orderBy('order').get();
 return Promise.all(list.docs.filter(s=>s.get('kind')!=='section').map(async s=>{
  const [body,key,notes]=await Promise.all([s.ref.collection('private').doc('body').get(),s.ref.collection('private').doc('key').get(),s.ref.collection('private').doc('notes').get()]);
  const t=s.data();return {id:s.id,title:t.title,instructions:t.instructions??'',instrDoc:t.instrDoc??null,content:t.restricted?body.get('content'):t.content,key:key.data()??{},notes:notes.get('text')??'',family:t.family??null,variants:t.variants??[],variant:t.variant??null,order:t.order,restricted:!!t.restricted};
 }));
}
export async function taskTools(req,{db,uid,cls,apiKey,model}) {
 const d=req.data;
 if(d.action==='taskToolsIdeas'){
  if(!id(d.itemId))fail('Open a lesson first.');
  const item=cls.ref.collection('items').doc(d.itemId),saved=await item.get();
  if(!saved.exists)fail('This lesson is no longer available.');
  if(typeof d.direction!=='string'||d.direction.length>2500)fail('Use a direction up to 2,500 characters.');
  const tasks=(await sources(item)).filter(t=>!t.family||t.family===t.id);
  const minutes=Number.isInteger(d.minutes)&&d.minutes>=1&&d.minutes<=60?d.minutes:10;
  const classMedia=await taskMediaContext({db,uid,cls,tasks,direction:d.direction,title:saved.get('title')});
  const cacheId=hash({version:2,classMedia,model,classId:d.classId,itemId:d.itemId,title:saved.get('title'),objective:saved.get('speakingFocus')??'',level:cls.get('level')??'',profile:cls.get('learningProfile')??{},training:cls.get('trainingProfile')??null,tasks,minutes,direction:d.direction});
  const cache=db.doc(`aiPrivate/${uid}/ideaCache/${cacheId}`);
  const requestId=await db.runTransaction(async tx=>{
   const c=await tx.get(cache),previous=c.get('requestId');
   if(previous){const j=await tx.get(db.doc(`aiPrivate/${uid}/jobs/${previous}`));
    const stale=j.get('status')==='running'&&Date.now()-(j.get('createdAt')?.toMillis()??Date.now())>600000;
    if(!j.exists||j.get('status')==='completed'||j.get('status')==='running'&&!stale||d.background===true)return previous;
   }
   const next='ideas_'+randomUUID();tx.set(cache,{requestId:next,createdAt:Timestamp.now(),classId:d.classId,itemId:d.itemId});return next;
  });
  const ref=db.doc(`aiPrivate/${uid}/jobs/${requestId}`),options={db,uid,cls,apiKey,model};
  const read=()=>taskTools({...req,data:{...d,action:'taskToolsStatus',requestId}},options);
  const previous=await ref.get();
  if(previous.exists){if(previous.get('status')==='running'&&Date.now()-(previous.get('createdAt')?.toMillis()??Date.now())>600000)return {status:'failed',error:'Idea preparation was interrupted. Open task creation to try again.',requestId};return {...await read(),requestId};}
  try{return {...await taskTools({...req,data:{...d,action:'taskTools',requestId,mode:'next',step:'ideas',scope:'lesson',minutes}},options),requestId};}
  catch(e){if((await ref.get()).exists)return {...await read(),requestId};throw e;}
 }
 if(!id(d.itemId)||!id(d.requestId))fail('Open a lesson and start a new request.');
 const item=cls.ref.collection('items').doc(d.itemId),itemSnap=await item.get();
 if(!itemSnap.exists)fail('This lesson is no longer available.');
 const job=db.doc(`aiPrivate/${uid}/jobs/${d.requestId}`);
 const old=(await job.get()).data();
 if(['taskToolsStatus','taskToolsApply','taskToolsRetryMedia'].includes(d.action)) {
  if(old?.action!=='taskTools'||old.classId!==d.classId||old.itemId!==d.itemId)fail('This draft is no longer available.');
  if(d.action==='taskToolsRetryMedia') {
   if(!id(d.assetId))fail('Choose a media asset.');
   const ref=job.collection('media').doc(d.assetId);const a=await ref.get();
   if(!a.exists||!(a.get('status')==='failed'||['queued','running'].includes(a.get('status'))&&Date.now()-((a.get('startedAt')??a.get('createdAt'))?.toMillis?.()??Date.now())>600000))fail('This asset is already prepared or still running.');
   await ref.update({status:'queued',error:'',retriedAt:Timestamp.now()});return {status:'completed'};
  }
  if(old.status!=='completed')return {status:old.status,error:old.error??''};
  const result=readGenerationResult(old),media=await job.collection('media').get();
  const assets=media.docs.map(s=>({id:s.id,...s.data()}));
  if(result.activity&&!result.edited){result.activity.preparedMedia=assets.filter(a=>a.status==='ready').map(a=>({kind:a.kind,title:a.title,alt:a.alt??'',credit:a.credit??'',existing:a.existing===true,mediaId:a.mediaId}));result.native=previewNative(result);}
  if(d.action==='taskToolsStatus')return {status:'completed',result,media:assets.map(a=>({id:a.id,title:a.title,status:['queued','running'].includes(a.status)&&Date.now()-((a.startedAt??a.createdAt)?.toMillis?.()??Date.now())>600000?'failed':a.status,error:a.error||'Preparation was interrupted. Retry this asset.'}))};
  if(result.ideas)fail('Choose an idea and generate the activity before applying it.');
  if(old.appliedTaskId)return {applied:true,taskId:old.appliedTaskId};
  if(assets.some(a=>a.status!=='ready'))fail('Wait for the activity images and recordings to finish before adding it.');
  const current=await sources(item);
  const currentScope=old.mode==='next'?current.filter(t=>!t.family||t.family===t.id):old.mode==='answers'&&old.scope==='lesson'?current:current.filter(t=>old.sourceIds.includes(t.id));
  if(hash(currentScope)!==old.sourceHash)fail('The lesson changed while this draft was being made. Generate a fresh draft to keep your latest edits.');
  const target=item.collection('tasks').doc('tool_'+d.requestId);
  await db.runTransaction(async tx=>{
   const liveJob=await tx.get(job);if(liveJob.get('appliedTaskId'))return;
   const itemNow=await tx.get(item);
   const sequence=await tx.get(item.collection('tasks').orderBy('order'));
   if(old.mode==='next'||old.mode==='answers'&&old.scope==='lesson'){const ids=sequence.docs.filter(t=>t.get('kind')!=='section'&&(old.mode!=='next'||!t.get('family')||t.get('family')===t.id)).map(t=>t.id);if(JSON.stringify(ids)!==JSON.stringify(old.sourceIds))fail('The lesson sequence changed. Generate a fresh draft before applying it.');}
   const taskSnaps=await Promise.all(currentScope.map(t=>tx.get(item.collection('tasks').doc(t.id))));
   const keySnaps=await Promise.all(currentScope.map(t=>tx.get(item.collection('tasks').doc(t.id).collection('private').doc('key'))));
   const bodySnaps=await Promise.all(currentScope.map(t=>tx.get(item.collection('tasks').doc(t.id).collection('private').doc('body'))));
   const notesSnaps=await Promise.all(currentScope.map(t=>tx.get(item.collection('tasks').doc(t.id).collection('private').doc('notes'))));
   const snapshot=currentScope.map((t,i)=>({...t,title:taskSnaps[i].get('title'),instructions:taskSnaps[i].get('instructions')??'',instrDoc:taskSnaps[i].get('instrDoc')??null,content:taskSnaps[i].get('restricted')?bodySnaps[i].get('content'):taskSnaps[i].get('content'),key:keySnaps[i].data()??{},notes:notesSnaps[i].get('text')??'',family:taskSnaps[i].get('family')??null,variants:taskSnaps[i].get('variants')??[],variant:taskSnaps[i].get('variant')??null,order:taskSnaps[i].get('order'),restricted:!!taskSnaps[i].get('restricted')}));
   if(hash(snapshot)!==old.sourceHash)fail('This activity changed. Generate a fresh draft before applying it.');
   if(old.mode==='edit') {
    const from=currentScope[0],ref=item.collection('tasks').doc(from.id),updated=applyTaskTextEdits(from,result.edits);
    // Keep a private recovery copy in the same atomic transaction as the edit.
    tx.set(job.collection('original').doc('task'),{...from,savedAt:Timestamp.now()});
    tx.set(ref.collection('versions').doc('before_'+d.requestId),{title:from.title,instructions:from.instructions,instrDoc:taskSnaps[0].get('instrDoc')??null,content:mergeKey(from.content,from.key),by:uid,at:Timestamp.now()});
    tx.update(ref,{title:updated.title,instructions:updated.instructions,instrDoc:updated.instructions===from.instructions?from.instrDoc:null,content:from.restricted?null:updated.content});
    if(from.restricted)tx.set(ref.collection('private').doc('body'),{content:updated.content});
    tx.set(ref.collection('private').doc('key'),updated.key);
    tx.set(ref.collection('private').doc('notes'),{text:updated.notes,updatedAt:Timestamp.now()});
    tx.update(job,{appliedTaskId:from.id,appliedAt:Timestamp.now()});return;
   }
   if(old.mode==='answers') {
    for(const t of currentScope){const additions=result.entries.filter(e=>e.taskId===t.id);if(additions.length)tx.set(item.collection('tasks').doc(t.id).collection('private').doc('key'),{...t.key,...Object.fromEntries(additions.map(e=>[e.questionId,e.key]))});}
    tx.update(job,{appliedTaskId:old.sourceIds[0]??'lesson',appliedAt:Timestamp.now()});return;
   }
   const last=await tx.get(item.collection('tasks').orderBy('order','desc').limit(1));
   const from=currentScope[0];let main=null;
   if(old.mode==='differentiate'){const mainRef=item.collection('tasks').doc(from.family??from.id);main=await tx.get(mainRef);}
   const native=result.native,activity=result.activity;
   tx.create(target,{kind:'task',title:old.mode==='differentiate'?main.get('title'):activity.title,instructions:activityMainInstruction(activity),content:old.mode==='differentiate'?null:native.content,restricted:old.mode==='differentiate',...(old.mode==='differentiate'?{family:main.id,variant:old.variantLabel,allowed:[]}:{}),order:old.mode==='differentiate'?main.get('order'):(last.docs[0]?.get('order')??-1)+1,hidden:false,locked:false,layout:activity.layout==='columns'?'two':'single',createdAt:Timestamp.now()});
   if(old.mode==='differentiate') {tx.create(target.collection('private').doc('body'),{content:native.content});tx.update(main.ref,{family:main.id,variant:main.get('variant')??'Standard',variants:[...(main.get('variants')??[]),target.id]});}
   tx.create(target.collection('private').doc('key'),native.key);tx.create(target.collection('private').doc('notes'),{text:native.notes,updatedAt:Timestamp.now()});
   tx.update(item,{taskCount:(itemNow.get('taskCount')??current.length)+1});
   tx.update(job,{appliedTaskId:target.id,appliedAt:Timestamp.now()});
  });
  return {applied:true,taskId:['answers','edit'].includes(old.mode)?(old.sourceIds[0]??''):target.id};
 }
 if(old)return {status:old.status};
 if(!['answers','differentiate','next','edit'].includes(d.mode)||!['ideas','generate'].includes(d.step))fail('Choose a lesson tool.');
 if(typeof d.direction!=='string'||d.direction.length>2500)fail('Use a direction up to 2,500 characters.');
 if(d.mode==='edit'&&(d.step!=='generate'||!d.direction.trim()))fail('Describe the changes you want first.');
 const all=await sources(item),selected=all.find(t=>t.id===d.taskId);
 if(!selected&&(['differentiate','edit'].includes(d.mode)||d.mode==='answers'&&d.scope!=='lesson'))fail('Select an activity first.');
 const scope=d.mode==='answers'&&d.scope==='lesson'?all:d.mode==='next'?all.filter(t=>!t.family||t.family===t.id):[selected];
 if(!scope.length&&d.mode!=='next')fail('Add an activity before generating its answers or differentiated version.');
 const missing=scope.flatMap(t=>[...taskQuestions(t.content)].filter(([qid,n])=>['gap','choice','mcq','match','dropgap','order','writing','pq'].includes(n.type)&&!hasAnswer(t.key[qid])).map(([qid,n])=>({taskId:t.id,questionId:qid,type:n.type,kind:n.attrs?.kind??'',currentKey:t.key[qid]??null})));
 if(d.mode==='answers'&&!missing.length)return {status:'completed',result:{entries:[],issues:['The existing inline answer keys are already filled.']},media:[]};
 const input={classProfile:cls.get('learningProfile')??{},trainingProfile:cls.get('trainingProfile')??null,level:cls.get('level')??'',lessonTitle:itemSnap.get('title'),learningObjective:itemSnap.get('speakingFocus')??'',sourceTasks:scope,isFirstActivity:!scope.length,missingAnswers:missing,teacherDirection:d.direction,mode:d.mode,includeImage:d.mode==='next'&&d.step==='generate'&&d.includeImage===true,minutes:Number.isInteger(d.minutes)&&d.minutes>=1&&d.minutes<=60?d.minutes:10};
 if(Buffer.byteLength(JSON.stringify(input))>48000)fail('This lesson is too large for one request. Use the tool on an individual activity.');
 const classMedia=await taskMediaContext({db,uid,cls,tasks:scope,direction:d.direction,title:itemSnap.get('title')});
 input.classMedia=classMedia;
 if(d.mode==='edit')input.editableFields=editableTaskFields(selected);
 // Keep the existing input limit even for large, multilingual transcripts.
 while(Buffer.byteLength(JSON.stringify(input))>48000){
  if(classMedia.images.length)classMedia.images.pop();
  else if(classMedia.recordings.length)classMedia.recordings.pop();
  else break;
 }
 const context=await usageContext(db,req.auth);checkModel(model);
 const month=new Date().toISOString().slice(0,7),budget=db.doc(`${context.isAdmin?'aiAdminBudgets':'aiBudgets'}/${month}`);
 await db.runTransaction(async tx=>{const j=await tx.get(job);if(j.exists)fail('This request is already running.');const b=await tx.get(budget);const reservation=reserveBudget(b.get('committedMicroUsd')??0,1,context.isAdmin);await chargeFeature(tx,db,context,'lessonActivities');tx.set(budget,{committedMicroUsd:reservation.balance,month},{merge:true});tx.create(job,{action:'taskTools',classId:d.classId,itemId:d.itemId,mode:d.mode,scope:d.scope??'activity',sourceIds:scope.map(t=>t.id),sourceHash:hash(scope),variantLabel:d.variantLabel==='Challenge'?'Challenge':'Supported',status:'running',createdAt:Timestamp.now(),reserved:reservation.reserved});});
 let repairStarted=false;
 try {
  let schema,instructions,name,result;
  if(d.mode==='edit'){schema=editSchema;instructions=editInstructions;name='task_edit';}
  else if(d.mode==='answers'){schema=keysSchema;instructions=keyInstructions;name='task_keys';}
  else if(d.step==='ideas'){schema=ideasSchema;name='task_ideas';instructions=activityInstructions+'\n'+contentReviewStandard+'\nIDEAS ONLY: Return exactly two genuinely different, concise options, not full activities. For differentiation return one support option and one challenge option addressing the SAME objective and comparable duration. Describe concrete changes to the existing native tasks (e.g. gap to choices; word bank removal), never just extra work. For next activity, read the whole lesson sequence and suggest two pedagogically justified next moves, recycling language where useful. Teacher direction takes precedence. No abstract teacher jargon in titles.';}
  else {
    const training=cls.get('kind')==='training';
    schema=d.mode==='next'?taskCreationSchema(training):structuredClone(training?trainingActivitySchema:activitySchema);
    const taskSchema=schema.properties.tasks.items;
    schema.properties.tasks.maxItems=1;
    taskSchema.properties.roles.maxItems=0;
    taskSchema.properties.versions.maxItems=0;
    taskSchema.properties.stageId={...taskSchema.properties.stageId,enum:['tool']};
    taskSchema.properties.minutes={type:'integer',minimum:input.minutes,maximum:input.minutes};
    name='activities';
    instructions=activityInstructions+(training?trainingActivityInstructions:'')+'\nCreate exactly ONE complete activity with stageId "tool" and exactly the requested minutes. Follow the teacher-selected direction. Differentiation must preserve the original learning aim and change scaffolding or demand, not append more work. Keep important source texts and context. Use no additional versions or roles in this request. For next activity, build a coherent next step from the lesson already taught. Create needed audio/images through mediaPlan, with complete scripts. Never refer to an image or recording that you have not supplied in mediaPlan. Do not invent existing learner evidence. When differentiating, existing pictures, recordings and dialogues are retained automatically; keep the same source and adapt only the response/scaffold. Do not request replacement media for these existing resources.';
    if(d.mode==='next')instructions+='\nNATIVE ELEMENTS: You may use inlineElements in the task or a sub-task for the precise teacher-requested editor interaction. Do not put legacy questions in the same part as inlineElements. Every element needs a complete prompt and private answer data where applicable; leave needs empty. Do not use a text box as a substitute for a native question. Use mediaPlan for new pictures and recordings; do not fabricate external URLs. For a label-the-image element, leave data.image empty and request one image in mediaPlan; the app attaches it after preparation. For a speaking prompt with photos, leave data.images empty and request the needed image in mediaPlan. For a listening request, use format listening and request NEW audio with exact spoken lines unless the teacher explicitly asks to use an existing recording. Put only the exact spoken words, one line per turn, in teacherOnlyInput, with no speaker names or stage directions. Never put a transcript in learner input.\nAVAILABLE NATIVE ELEMENTS:\n'+taskCreationCatalogue(training);
  }
  if(input.isFirstActivity)instructions+='\nThis lesson has no previous activities. Create a self-contained first activity using the teacher direction, lesson title, level and class goals. Supply all input and instructions it needs. Use any supplied classMedia when relevant. Do not assume the class has covered it before. Offer two distinct appropriate starting points when asked for ideas.';
  if(input.includeImage)instructions+='\nThe teacher requested a picture learners will use in this activity. Include exactly one image in mediaPlan. Use an existing Resources picture only when its metadata fits the task; otherwise request a new illustration or licensed photograph. Give learners a concrete action with the image. Do not claim the picture is already prepared; it must finish preparing before the activity is added.';
  instructions+='\n'+taskMediaGuidance;
  const checkValue=value=>{
   if(d.mode==='edit')applyTaskTextEdits(selected,value);
   else if(d.mode==='answers'){const seen=new Set();for(const e of value.entries){const m=missing.find(x=>x.taskId===e.taskId&&x.questionId===e.questionId);if(!m||seen.has(e.taskId+':'+e.questionId))throw Error('Return only missing answers, once per question.');seen.add(e.taskId+':'+e.questionId);checkedKey(taskQuestions(scope.find(t=>t.id===e.taskId).content).get(e.questionId),JSON.parse(e.answerJson));}}
   else if(d.step==='ideas'){if(d.mode==='differentiate'&&(!value.ideas.some(i=>i.kind==='support')||!value.ideas.some(i=>i.kind==='challenge')))throw Error('Return one support and one challenge option.');}
   else {
    checkTaskMediaPlan(value.tasks[0],classMedia,d.mode==='differentiate'?retainedMedia(selected.content):[],d.direction);
    if(input.includeImage&&value.tasks[0].mediaPlan.filter(a=>a.kind==='image').length!==1)throw Error('Include the requested picture in the activity media plan.');
    checkActivities(value,{stages:[{id:'tool',minutes:input.minutes}]},cls.get('kind')==='training',d.mode==='next');
   }
  };
  const checked=await generateChecked({generate,args:{apiKey,model,schema,name,input,instructions},decode:v=>v,check:checkValue,reserveRepair:async()=>{repairStarted=true;return db.runTransaction(async tx=>{const [b,j]=await Promise.all([tx.get(budget),tx.get(job)]);const reservation=reserveBudget(b.get('committedMicroUsd')??0,1,context.isAdmin);tx.update(budget,{committedMicroUsd:reservation.balance});tx.update(job,{reserved:j.get('reserved')+reservation.reserved});});}});
  const generated={value:checked.value};
  if(d.mode==='edit'){const edited=applyTaskTextEdits(selected,generated.value);result={edited:true,edits:generated.value,activity:{title:edited.title,instructions:edited.instructions},native:{content:edited.content,key:edited.key,notes:edited.notes},issues:[generated.value.summary]};}
  else if(d.mode==='answers') {
   const seen=new Set();const entries=[];
   for(const e of generated.value.entries){const m=missing.find(x=>x.taskId===e.taskId&&x.questionId===e.questionId);if(!m||seen.has(e.taskId+':'+e.questionId))throw Error('Unexpected answer target.');seen.add(e.taskId+':'+e.questionId);const t=scope.find(t=>t.id===e.taskId),node=taskQuestions(t.content).get(e.questionId);entries.push({...e,key:checkedKey(node,JSON.parse(e.answerJson))});}
   result={entries,issues:generated.value.issues};
  } else if(d.step==='ideas')result=generated.value;
  else {const value=generated.value;result={activity:value.tasks[0],retainedMedia:d.mode==='differentiate'?retainedMedia(selected.content):[]};result.native=previewNative(result);}
  const assets=result.activity&&!result.edited?mediaRequests({tasks:[result.activity]}):[];
  const j=await job.get();
  const media=await db.runTransaction(async tx=>{
   const b=await tx.get(budget);
   const media=await prepareActivityAssets(tx,{db,uid,cls},assets);
   if(result.activity&&!result.edited){result.activity.preparedMedia=media.filter(a=>a.status==='ready').map(({kind,title,mediaId,alt,credit,existing})=>({kind,title,mediaId,alt,credit,existing}));result.native=previewNative(result);}
   const settled=settleBudget(b.get('committedMicroUsd')??0,j.get('reserved'),checked.usage);
   tx.update(budget,{committedMicroUsd:settled.balance});
   tx.update(job,{status:'completed',...encodeGenerationResult(result),completedAt:Timestamp.now()});
   for(const asset of media)tx.create(job.collection('media').doc(asset.id),{...asset,classId:d.classId,createdAt:Timestamp.now()});
   return media.map(({id,title,status})=>({id,title,status}));
  });
  return {status:'completed',result,media};
 }catch(e){
  const reason=e instanceof GenerationError?e.reason:'unknown';
  const messages={billing:'AI generation is unavailable because the API account has no credit. Your administrator needs to restore API credit before you retry. Your lesson is saved and unchanged.',rate_limit:'The AI service is busy. Please wait a moment, then try again. Your lesson is saved and unchanged.',timeout:'The AI service took too long. Please try again. Your lesson is saved and unchanged.',connection:'The connection to the AI service was interrupted. Please try again. Your lesson is saved and unchanged.',output_limit:'This draft was too long to finish. Try one activity at a time. Your lesson is saved and unchanged.'};
  const error=messages[reason]??'This draft could not finish. Please try again. Your lesson is saved and unchanged.';
  console.warn('lesson-tool-failed',{mode:d.mode,step:d.step,reason});
  if(['rate_limit','billing'].includes(reason)&&!repairStarted)await db.runTransaction(async tx=>{const [b,j]=await Promise.all([tx.get(budget),tx.get(job)]);const reserved=j.get('reserved')??0;if(!j.get('reservationReleased')&&b.get('committedMicroUsd')>=reserved){tx.update(budget,{committedMicroUsd:b.get('committedMicroUsd')-reserved});tx.update(job,{reservationReleased:true});}});
  await job.update({status:'failed',error,reason});
  return {status:'failed',error};
 }
}

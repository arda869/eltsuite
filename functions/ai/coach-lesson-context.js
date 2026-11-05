import {gameReferences,loadGameEvidence} from './coach-games.js';
const text=(v,n=1200)=>typeof v==='string'?v.slice(0,n):'';
export function lessonSource(value) {
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw Error('Open the lesson you want to discuss.');
 const out={};for(const key of ['classId','itemId','taskId','reportId']){const v=value[key]??'';if(typeof v!=='string'||!(/^[a-zA-Z0-9_-]{0,100}$/).test(v))throw Error('Open a valid lesson or report.');out[key]=v;}
 if(!out.classId||!out.itemId)throw Error('Choose a class and lesson.');return out;
}
export function teachingExcerpt(node,limit=7000) {
 const parts=[];let remaining=limit;
 const add=v=>{if(typeof v==='string'&&remaining>0){const s=v.slice(0,remaining);parts.push(s);remaining-=s.length;}};
 const visit=n=>{if(!n||remaining<=0)return;if(n.text)add(n.text);if(n.type==='gap')add('[gap]');if(n.attrs){for(const key of ['prompt','title','instructions','text','input','alt'])add(n.attrs[key]);if(Array.isArray(n.attrs.options))add(n.attrs.options.filter(x=>typeof x==='string').join(' / '));if(n.type==='tt')add(JSON.stringify(n.attrs.data??{}));}for(const c of n.content??[])visit(c);if(n.type==='paragraph')add('\n');};
 visit(node);return parts.join(' ');
}
export function reportExcerpt(report) {
 let rows;try{rows=JSON.parse(report.reportsJson??'[]');}catch{rows=[];}
 return (Array.isArray(rows)?rows:[]).slice(0,8).map((r,i)=>{
 const records=(r.records??[]).slice(0,4),ids=new Map(records.map((e,j)=>[e.id,'L'+(i+1)+'E'+(j+1)]));
 return {learner:'Learner '+(i+1),summary:r.summary,observation:text(r.observation),likelyExperience:text(r.likelyExperience),suggestions:(r.suggestions??[]).slice(0,2).map(s=>({text:text(s.text),evidenceIds:(s.evidenceIds??[]).map(id=>ids.get(id)).filter(Boolean)})),records:records.map(e=>({id:ids.get(e.id),title:text(e.title,160),checked:e.checked,score:e.score,total:e.total,activeMs:e.activeMs,submissions:e.submissions,questions:e.questions}))};
 });
}
const answerText=value=>{
 if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean'&&!Array.isArray(value))return '';
 const raw=Array.isArray(value)?value.filter(v=>['string','number','boolean'].includes(typeof v)).slice(0,8).join(', '):String(value);
 return raw.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email removed]').replace(/\+?\d[\d\s().-]{8,}\d/g,'[number removed]').slice(0,260);
};
export async function loadLessonSource(db,uid,source,{games=true,learnerWork=true}={}) {
 const {HttpsError}=await import('firebase-functions/v2/https');
 const cls=db.doc('classes/'+source.classId), c=await cls.get();
 if(!c.exists||(c.get('teacherId')!==uid&&c.get('coTeachers')?.[uid]?.role!=='co'))throw new HttpsError('permission-denied','You no longer teach this class. Open a lesson you can access.');
 const item=cls.collection('items').doc(source.itemId),i=await item.get();
 if(!i.exists)throw new HttpsError('not-found','This lesson is no longer available.');
 const snaps=source.taskId?[await item.collection('tasks').doc(source.taskId).get()]:(await item.collection('tasks').orderBy('order').limit(12).get()).docs;
 if(source.taskId&&!snaps[0].exists)throw new HttpsError('not-found','This activity is no longer available.');
 const gameIds=[];const tasks=[];for(const s of snaps){if(s.get('kind')==='section'||(!source.taskId&&s.get('family')&&s.get('family')!==s.id))continue;const body=s.get('restricted')?(await s.ref.collection('private').doc('body').get()).get('content'):s.get('content');if(games)gameIds.push(...gameReferences(body));tasks.push({title:text(s.get('title'),160),instructions:text(s.get('instructions')),material:teachingExcerpt(body,source.taskId?7000:900)});}
 const title=text(i.get('title'),160),url='/class/'+source.classId+'/lesson/'+source.itemId+(source.taskId?'?task='+source.taskId:'');
 const context={title,className:text(c.get('name'),100),kind:c.get('kind')??'language',level:c.get('level')??'',profile:c.get('kind')==='training'?c.get('trainingProfile')??{}:c.get('learningProfile')??{},tasks,scope:source.taskId?'Selected activity only':'Up to twelve activity excerpts; the full course has not been read'};
 const sources=[{title:(source.taskId?tasks[0]?.title:title)||'Selected lesson',url}];
 if(learnerWork){
   const [sample,portfolio]=await Promise.all([cls.collection('answers').where(source.taskId?'taskId':'itemId','==',source.taskId||source.itemId).limit(80).get(),cls.collection('portfolio').limit(80).get()]);
   const matching=sample.docs.map(d=>d.data()).filter(a=>a.itemId===source.itemId&&(!source.taskId||a.taskId===source.taskId));
   const responses=matching.slice(0,12).map((a,i)=>({learner:'Learner '+(i+1),taskId:a.taskId,checked:!!a.checked,score:Number.isFinite(a.score)?a.score:null,total:Number.isFinite(a.total)?a.total:null,answers:Object.entries(a.responses??{}).slice(0,8).map(([question,value])=>({question,text:answerText(value)})).filter(x=>x.text)}));
   const reading=portfolio.docs.map(d=>d.data()).filter(p=>p.skill==='Reading'||p.kind==='profile'&&p.skills?.Reading).slice(0,12).map(p=>p.kind==='profile'?{kind:'skill level',level:text(p.skills?.Reading,30)}:{kind:'kept work',title:text(p.title,160),note:answerText(p.note)});
   if(responses.length||reading.length){context.learnerWork={responses,reading,scope:`${responses.length} anonymised activity records from a query capped at 80, and ${reading.length} reading portfolio records from a query capped at 80. These are samples, not the whole class; free-text excerpts are shortened and common contact details are removed.`};if(responses.length)sources.push({title:`Learner activity responses · ${responses.length} sampled`,url:'/class/'+source.classId+'?tab=reports'});if(reading.length)sources.push({title:`Reading portfolio records · ${reading.length} sampled`,url:'/class/'+source.classId+'?tab=portfolio'});}
 }
 if(source.reportId){const r=await cls.collection('learningReports').doc(source.reportId).get();if(!r.exists||r.get('itemId')!==source.itemId||r.get('status')!=='completed')throw new HttpsError('not-found','This saved report is not available for this lesson.');context.report={kind:r.get('kind'),learners:reportExcerpt(r.data()),limitation:'Saved evidence snapshot; anonymous learner labels refer only to this report. Timing and revisions do not establish ability or indecision.'};sources.push({title:'Saved learner evidence for '+title,url});}
 if(games&&gameIds.length){context.games=await loadGameEvidence(db,source.classId,gameIds);sources.push(...context.games.map(g=>({title:'Game: '+g.title,url:g.url})));}
 return {context,sources};
}

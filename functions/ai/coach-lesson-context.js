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
export async function loadLessonSource(db,uid,source) {
 const {HttpsError}=await import('firebase-functions/v2/https');
 const cls=db.doc('classes/'+source.classId), c=await cls.get();
 if(!c.exists||(c.get('teacherId')!==uid&&c.get('coTeachers')?.[uid]?.role!=='co'))throw new HttpsError('permission-denied','You no longer teach this class. Open a lesson you can access.');
 const item=cls.collection('items').doc(source.itemId),i=await item.get();
 if(!i.exists)throw new HttpsError('not-found','This lesson is no longer available.');
 const snaps=source.taskId?[await item.collection('tasks').doc(source.taskId).get()]:(await item.collection('tasks').orderBy('order').limit(12).get()).docs;
 if(source.taskId&&!snaps[0].exists)throw new HttpsError('not-found','This activity is no longer available.');
 const tasks=[];for(const s of snaps){if(s.get('kind')==='section'||(!source.taskId&&s.get('family')&&s.get('family')!==s.id))continue;const body=s.get('restricted')?(await s.ref.collection('private').doc('body').get()).get('content'):s.get('content');tasks.push({title:text(s.get('title'),160),instructions:text(s.get('instructions')),material:teachingExcerpt(body,source.taskId?7000:900)});}
 const title=text(i.get('title'),160),url='/class/'+source.classId+'/lesson/'+source.itemId+(source.taskId?'?task='+source.taskId:'');
 const context={title,kind:c.get('kind')??'language',level:c.get('level')??'',profile:c.get('kind')==='training'?c.get('trainingProfile')??{}:c.get('learningProfile')??{},tasks,scope:source.taskId?'Selected activity only':'Up to twelve activity excerpts; the full course has not been read'};
 const sources=[{title:(source.taskId?tasks[0]?.title:title)||'Selected lesson',url}];
 if(source.reportId){const r=await cls.collection('learningReports').doc(source.reportId).get();if(!r.exists||r.get('itemId')!==source.itemId||r.get('status')!=='completed')throw new HttpsError('not-found','This saved report is not available for this lesson.');context.report={kind:r.get('kind'),learners:reportExcerpt(r.data()),limitation:'Saved evidence snapshot; anonymous learner labels refer only to this report. Timing and revisions do not establish ability or indecision.'};sources.push({title:'Saved learner evidence for '+title,url});}
 return {context,sources};
}

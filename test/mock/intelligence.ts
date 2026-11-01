import {getDoc,doc} from './firestore';
export async function mockIntelligence(d:any){
 const cls=(await getDoc(doc({},'classes',d.classId))).data()??{};
 const id='class',version=JSON.stringify({classId:d.classId,itemId:d.itemId,taskId:d.taskId,excluded:d.excluded??[]});
 const sources=[{id,kind:'class',title:cls.name??'Demo class',date:null,confidence:'teacher-recorded',url:`/class/${d.classId}`},...(d.itemId?[{id:'lesson:'+d.itemId,kind:'lesson',title:'Current lesson',date:Date.now(),confidence:'draft',url:`/class/${d.classId}/lesson/${d.itemId}`}]:[])];
 const context={classId:d.classId,className:cls.name??'Demo class',sourceVersion:version,completedLessons:cls.intelligenceCompletedLessons??0,availableSources:sources,sources:sources.filter(s=>!d.excluded?.includes(s.id)),limitations:['Missing work is unknown. This is a bounded sample.']};
 const key='mockIntelligence:'+d.classId,turns=JSON.parse(localStorage.getItem(key)??'[]');localStorage.setItem('lastIntelligenceRequest',JSON.stringify(d));
 if(d.action==='intelligenceContext')return {data:{context,conversation:turns}};
 if(d.action==='intelligenceAsk'){
 if(d.question.includes('FAIL_TEST'))return {data:{error:'The AI service is busy. Your lesson is unchanged.'}};
 const option={title:'Choose a shared day out',objectives:'Ask about preferences and agree on a shared plan.',activityType:'Speaking — information gap',learnerAction:'Compare private preference cards and choose a destination.',interaction:'Pairs',minutes:45,sequence:['Discover an unusual place','Compare private information','Agree on a plan'],rationale:'The choice gives each partner a reason to listen.',differentiation:'Optional question prompts.',transition:'Reuse the place vocabulary.',evidenceIds:[id]};
 const turn={id:d.requestId,question:d.question,mode:d.mode,scope:{itemId:d.itemId,taskId:d.taskId},sourceVersion:version,sources:context.sources,response:{summary:context.completedLessons?'Build on the recorded work with a purposeful new task.':'No completed teaching is recorded yet. Start with rapport and a light diagnostic.',findings:[{title:'Evidence is limited',kind:'unknown',observation:'There is no basis for a mastery judgement.',reasoning:'Missing work cannot demonstrate ability.',evidenceIds:[id],confidence:'unknown'}],options:[option,{...option,title:'Find a surprising connection'}],limitations:['This is mock advice for interface testing.']}};
 localStorage.setItem(key,JSON.stringify([...turns,turn]));return {data:{context,turn}};
 }
 if(d.action==='intelligenceBrief')return {data:{handoff:{version:1,classId:d.classId,sourceVersion:version,brief:{objectives:'Ask about preferences and agree on a shared plan.',context:'Compare private information and agree on a day out.',duration:45,topic:'A shared day out',methodology:'Recommend'}}}};
 if(d.action==='intelligenceProposeEdit')return {data:{proposal:{requestId:d.requestId,before:{title:'Activity',instructions:'Talk together.',notes:''},after:{title:'Activity',instructions:'Ask about your partner’s preferences, then agree on one choice.',notes:''},reason:'Give the exchange a concrete outcome.'}}};
 if(d.action==='intelligenceApplyEdit')return {data:{applied:true}};
 if(d.action==='intelligenceUndoEdit')return {data:{undone:true}};
 if(d.action==='intelligenceConfirmLesson')return {data:{confirmed:true}};
 throw Error('Unsupported intelligence test action');
}

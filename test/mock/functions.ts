import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';
// Test-only callable stand-in. Production builds never import this module.
export const getFunctions = () => ({});
export const httpsCallable = (_app: unknown, name: string) => async (d: any) => {
  if (d.action === 'activities' && localStorage.getItem('mockAiPause')) await new Promise<void>(resolve => { const timer=setInterval(()=>{if(!localStorage.getItem('mockAiPause')) {clearInterval(timer);resolve();}},50); });
  if (name === 'helpAssistant') {
    if (d.action === 'feedback') return { data: { saved: true } };
    await new Promise(resolve => setTimeout(resolve, 350));
    if (d.question.includes('FAIL_TEST')) throw Error('Test help unavailable.');
    const q = d.question.toLowerCase();
    const id = /record/.test(q) ? 'recordings' : /learner|join/.test(q) ? 'learners' : /lesson/.test(q) ? 'lessons' : /file/.test(q) ? 'files' : null;
    return { data: { articleIds: id ? [id] : [], version: '2026-10-31.2' } };
  }
  if (name === 'recordingSpeech') {
    if (d.text.includes('FAIL_TEST')) throw Error('Test voice unavailable.');
    const bytes=new Uint8Array(48000), view=new DataView(bytes.buffer);
    for(let i=0;i<24000;i++)view.setInt16(i*2,Math.sin(i/24000*Math.PI*440)*8000,true);
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return {data:{pcm:btoa(binary),rate:24000,transcript:d.text}};
  }
  if (name === 'recordingDialogue') return {data:{lines:Array.from({length:d.turns},(_,i)=>({speaker:d.speakers[i%d.speakers.length].id,text:i%2?'Of course. I meant this Friday, not Thursday.':'Sorry, could you clarify which day you mean?',direction:'Natural conversational English'}))}};
  if (['recordingLyrics','recordingSong','recordingSongResult'].includes(name)) {
    const key='mockSongs', jobs=JSON.parse(sessionStorage.getItem(key)||'{}');
    if(name!=='recordingSongResult'){
      localStorage.setItem('mockSongLastRequest',JSON.stringify({name,...d}));
      if(d.brief.style==='FAIL_TEST')throw Error('Test music service unavailable.');
      jobs[d.id]={kind:name==='recordingLyrics'?'lyrics':'song',lyrics:d.brief.lyrics};sessionStorage.setItem(key,JSON.stringify(jobs));return {data:{status:'complete'}};
    }
    const job=jobs[d.id];if(!job)throw Object.assign(Error('Creation not found. Your lyrics are kept.'),{code:'functions/not-found'});
    if(job.kind==='lyrics')return {data:{status:'complete',lyrics:'Every morning, here we go!\nTime to learn and time to grow!'}};
    const bytes=new Uint8Array(44+48000),view=new DataView(bytes.buffer),write=(at:number,s:string)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
    write(0,'RIFF');view.setUint32(4,bytes.length-8,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,48000,true);
    for(let i=0;i<24000;i++)view.setInt16(44+i*2,Math.sin(i*.1)*3000,true);
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return {data:{status:'complete',audio:btoa(binary),mime:'audio/wav',providerLyrics:job.lyrics}};
  }
  if (name === 'recordingTranscript') return {data:{segments:[{speaker:'A',text:'Could you explain that?',start:0,end:.4},{speaker:'B',text:'Of course.',start:.5,end:1}]}};
  if (name === 'speakingTask') {
    const {setDoc,doc,getDoc}=await import('./firestore');
    if(d.action==='configure'){await setDoc(doc({},'classes',d.classId,'speakingActivities',d.activityId),{...d.config,enabled:d.enabled!==false});return {data:{saved:true}};}
    if(d.action==='start'){
      const config=(await getDoc(doc({},'classes',d.classId,'speakingActivities',d.activityId))).data();
      const focus=config.feedbackMode==='learner'?config.focusOptions[d.focusChoice]:config.focus;
      const deadline=Date.now()+(new URLSearchParams(location.search).has('fakeRtc')?4000:config.seconds*1000);
      const {getAuth}=await import('./auth');const uid=getAuth().currentUser?.uid;
      await setDoc(doc({},'classes',d.classId,'speakingActivities',d.activityId,'sessions','test-session'),{uid,name:'Mia',config:{...config,focus},startedAt:Date.now(),deadline,status:'connecting',turns:[]});
      return {data:{sdp:'test-answer',sessionId:'test-session',deadline,seconds:config.seconds,focus}};
    }
    if(d.action==='progress'){await setDoc(doc({},'classes',d.classId,'speakingActivities',d.activityId,'sessions',d.sessionId),{turns:d.turns,status:d.status,help:d.help},{merge:true});return {data:{saved:true}};}
    if(d.action==='finish'){const feedback={focusFeedback:'You gave a reason for your choice using because.',evidence:['I would choose the park because it is quieter.'],communication:'You kept the conversation moving.',nextStep:'Add a second reason to develop your answer.',retryPrompt:'Another reason is…'};await setDoc(doc({},'classes',d.classId,'speakingActivities',d.activityId,'sessions',d.sessionId),{feedback,status:'complete',feedbackState:'complete'},{merge:true});return {data:{feedback}};}
  }
  if (name !== 'lessonAssistant') throw Error('Unsupported test callable');
  if (d.action === 'coach') {
    const { profileComplete, beliefsComplete, contextPermissions } = await import('../../functions/ai/coach-context.js');
    const current = (await import('firebase/auth')).getAuth().currentUser?.uid ?? 'teacher1';
    const p = (await getDoc(doc(db,'teachingCoach',current,'settings','profile'))).data();
    if (!beliefsComplete(p)) throw Error('Add your teaching beliefs before starting a coaching conversation.');
    if (!profileComplete(p)) throw Error('Complete your teaching profile before starting a coaching conversation.');
    const prefs = contextPermissions((await getDoc(doc(db,'teachingCoach',current,'settings','context'))).data());
    await new Promise(resolve=>setTimeout(resolve,350));
    return {data:{journalDraft:/draft.*journal|yes.*journal/i.test(d.prompt)?'I noticed a change in participation. I want to consider other explanations before deciding what to try next.':'',reply:'What did you notice about learners’ responses? What other explanation might fit what happened?',basis:[prefs.profile?'Your professional profile':'',prefs.beliefs&&p?.beliefs?'Your teaching beliefs':''].filter(Boolean)}};
  }
  localStorage.setItem('mockAiLastRequest',JSON.stringify(d));
  if(d.action==='memories') return {data:{memories:[{id:'a:q',name:'Alex',text:'I visited Rome last year.',item:'Travel stories',task:'Your experience'}]}};
  const store = JSON.parse(localStorage.getItem('mockAiDrafts') || '{}');
  if(d.action==='mediaStatus') return {data:{media:[]}};
  if (d.action === 'context') {const c=(await getDoc(doc(db,'classes',d.classId))).data()||{};return {data:{classContext:{name:c.name||'Demo class',level:c.level||'B1',kind:c.kind||'language',profile:c.learningProfile||null,trainingProfile:c.trainingProfile||null},evidence:{recent:[],skillLevels:{},counts:{items:0,submittedTasks:0,portfolioRecords:0},limitations:'No recorded evidence yet.'}}};}
  if (d.action === 'profile') {const c=(await getDoc(doc(db,'classes',d.classId))).data();await setDoc(doc(db,'classes',d.classId),c?.kind==='training'?{trainingProfile:d.trainingProfile,level:d.trainingProfile.programme}:{learningProfile:d.profile,level:d.level},{merge:true});return {data:{profileSaved:true}};}
  const stage = { id: 's1', title: 'Compare options', aim: 'Agree on a choice using reasons', minutes: d.brief.duration, interaction: 'Pairs' };
  if (d.action === 'outline') return { data: { outline: { title: 'Choose a trip', outcomes: ['Give reasons for a choice'], methodology: 'Task-based', rationale: 'Learners use English to reach a shared decision.', stages: [stage] } } };
  if (d.action === 'plan') return { data: { plan: { title: 'Choose a trip', mainAim: 'Agree on a trip and explain why', subsidiaryAims: 'Ask for a reason', assumedKnowledge: 'Basic comparatives', materials: 'Option cards', methodology: 'Task-based', rationale: 'A decision gives the task a purpose', assessment: 'Partners explain their decision', adaptations: 'Offer sentence starters', languageAnalysis: 'We could go by train. Modal could + base verb; weak form of could.', stages: [{ ...stage, procedures: 'Compare the two options. Agree on one. Report reasons.', instructions: 'Choose one trip together. Give two reasons.', instructionChecks: 'Do you choose one or both?', monitoring: 'Listen for reasons and shared decisions', feedback: 'Compare choices, then discuss useful language', transition: 'Share the decision', anticipatedProblems: 'One partner dominates', solutions: 'Assign each partner one option to explain', materialIds: ['m1'] }], learnerMaterials: [{ id: 'm1', title: 'Trip options', instructions: 'Compare these trips. Choose one and give reasons.', task: 'Train: £20, 40 minutes. Bus: £10, 70 minutes.', answerKey: 'Either option is acceptable with justified reasons.', script: 'Not applicable — speaking task', attribution: 'Original task', accessibleAlternative: 'Read the options aloud.' }] }, review: { checks: [{ criterion: 'Timing', score: 3, evidence: 'Test fixture only, not a model evaluation.' }], criticalErrors: [], suggestions: ['Check timing with the class.'] } } };
  if(d.action==='activities') { const activities={title:d.plan.title,rationale:'A complete decision task.',differentiation:'No recorded evidence: offer optional support.',recycling:'No history.',tasks:[{...(d.brief.level==='Foundation'?{trainingTool:'rehearsal'}:{}),stageId:'s1',title:'Choose and explain',format:'writing',minutes:d.brief.duration,instructions:'Choose a trip and explain.',input:'Train: £20. Bus: £10.',questions:[{prompt:'Which trip?',options:[],answer:'Either with reasons.',explanation:'Assess the reasons.'}],visuals:[{title:'Travel options',headers:['Transport','Price'],rows:[['Train','£20'],['Bus','£10']]}],versions:[{label:'Supported',reason:'A sentence frame supports the same choice.',instructions:'Choose a trip. Complete the sentence.',input:'I prefer the … because …',visuals:[],questions:[{prompt:'Which trip do you prefer?',options:[],answer:'Either with a reason.',explanation:'Listen for a reason.'}]}],teacherNotes:'Monitor reasons.',support:'I prefer… because…',challenge:'Compare environmental impact.'}]};localStorage.setItem('mockAiActivities',JSON.stringify({activities,type:d.creationType}));return {data:{activities}}; }
  if(d.action==='create') {const {activities,type}=JSON.parse(localStorage.getItem('mockAiActivities')!);const id='ai-test';await setDoc(doc(db,'classes',d.classId,'items',id),{type,title:activities.title,topicId:null,order:10,hidden:true,locked:false,taskCount:1});await setDoc(doc(db,'classes',d.classId,'items',id,'tasks','a1'),{kind:'task',title:'Choose and explain',instructions:'Choose a trip and explain.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Train: £20. Bus: £10.'}]},...(activities.tasks[0].trainingTool?[{type:'tt',attrs:{id:'training-test',kind:'rehearsal',title:'Microteaching rehearsal',mode:'complete',data:{}}}]:[])]},order:0,hidden:false,locked:false});return {data:{createdItemId:id}};}
  if (d.action === 'save') {
    if ((store[d.draftId]?.version ?? 0) !== d.version) throw Error('This plan changed in another window.');
    store[d.draftId] = { brief: d.brief, plan: d.plan, version: d.version + 1 };
    localStorage.setItem('mockAiDrafts', JSON.stringify(store));
    return { data: { version: d.version + 1 } };
  }
  if (d.action === 'list') return { data: { drafts: Object.entries(store).map(([id, v]: [string, any]) => ({ id, title: v.plan.title, version: v.version })) } };
  if (d.action === 'load') return { data: { draft: store[d.draftId] } };
  if (d.action === 'delete') { delete store[d.draftId]; localStorage.setItem('mockAiDrafts', JSON.stringify(store)); return { data: {} }; }
  throw Error('Unknown action');
};

import helpLibrary from '../../functions/help/library.json';
import { AI_FEATURES } from '../../functions/ai/features.js';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';
// Test-only callable stand-in. Production builds never import this module.
export const getFunctions = () => ({});
export const httpsCallable = (_app: unknown, name: string) => async (d: any) => {
  if (d.action === 'activities' && localStorage.getItem('mockAiPause')) await new Promise<void>(resolve => { const timer=setInterval(()=>{if(!localStorage.getItem('mockAiPause')) {clearInterval(timer);resolve();}},50); });
  if(name==='designerImage') {
    if(d.action==='connection')return {data:{ready:true}};
    if(d.action==='status')return {data:{status:'completed',resultId:d.requestId}};
    localStorage.setItem('lastDesignerRequest',JSON.stringify(d));
    if(d.action!=='restyle'&&!d.prompt?.trim())throw Error('Add a description.');
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
    const g=canvas.getContext('2d')!;g.fillStyle=d.action==='create'?'#5383aa':'#52966d';g.fillRect(0,0,160,120);
    const data=canvas.toDataURL('image/png').split(',')[1];
    await setDoc(doc(db,'sharedDocs',d.fileId,'designerResults',d.requestId+'_0'),{data});
    await setDoc(doc(db,'sharedDocs',d.fileId,'designerResults',d.requestId),{ready:true,parts:1,type:'image/png'});
    return {data:{status:'completed',resultId:d.requestId}};
  }
  if(name==='teachingDefinition') {
    const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;canvas.getContext('2d')!.fillRect(0,0,100,100);
    const picture={status:'ready',style:d.classId?'bright':'editorial',data:canvas.toDataURL('image/jpeg')};
    const {fields}=await import('../../functions/definitions/contract.js');
    return {data:{requestId:d.requestId,picture,illustration:{useful:true,prompt:'A grassy bank beside a river.',alt:'A grassy bank beside a river.',reason:'A picture makes this meaning clear.'},data:{...Object.fromEntries(fields.map(k=>[k,''])),pos:'noun',meaning:'The land at the side of a river.',example:'We sat on the river bank.',ipa:'/bæŋk/',collocations:'river bank',mistakes:'Here, bank is land beside water, not a place for money.'},translations:[],needsContext:false,note:'The river context selects the land meaning; wording is kept simple for A1.',level:'A1',ageGroup:'Young learners'}};
  }
  if (name === 'adminAiUsage') {
    const ref=doc(db,'aiAllowances',d.uid),old=(await getDoc(ref)).data()??{};
    if(d.action==='save'){
      if(d.limits.song===999)throw Error('Test save unavailable. Your changes have not been saved.');
      await setDoc(ref,{limits:d.limits,version:(old.version??0)+1});
    }
    const current=(await getDoc(ref)).data()??{};
    return {data:{features:AI_FEATURES,limits:current.limits??{},version:current.version??0,counts:{song:2,lyrics:4},day:new Date().toISOString().slice(0,10),isAdmin:d.uid==='teacher1'}};
  }
  if (name === 'helpAssistant') {
    if (d.action === 'feedback') return { data: { saved: true } };
    await new Promise(resolve => setTimeout(resolve, 350));
    if (d.question.includes('FAIL_TEST')) throw Error('Test help unavailable.');
    const q = d.question.toLowerCase();
    const id = /record/.test(q) ? 'recordings' : /learner|join/.test(q) ? 'learners' : /lesson/.test(q) ? 'lessons' : /file/.test(q) ? 'files' : null;
    return { data: { articleIds: id ? [id] : [], version: helpLibrary.version } };
  }
  if (name === 'recordingSpeech') {
    if (d.text.includes('FAIL_TEST')) throw Error('Test voice unavailable.');
    const bytes=new Uint8Array(48000), view=new DataView(bytes.buffer);
    for(let i=0;i<24000;i++)view.setInt16(i*2,Math.sin(i/24000*Math.PI*440)*8000,true);
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return {data:{pcm:btoa(binary),rate:24000,transcript:d.text}};
  }
  if (name === 'recordingDialogue') return {data:{lines:Array.from({length:d.turns},(_,i)=>({speaker:d.speakers[i%d.speakers.length].id,text:i%2?'Of course. I meant this Friday, not Thursday.':'Sorry, could you clarify which day you mean?',direction:'Natural conversational English'}))}};
  if (name === 'videoStudio') {
    const {getAuth}=await import('./auth'); const uid=getAuth().currentUser?.uid||'teacher1';
    if(d.action==='status') return {data:{enabled:true,plannerEnabled:true,simulated:true,model:'gen4.5',usdPerSecond:.12}};
    if(d.action==='plan') return {data:{status:'complete',plan:{title:'At the fruit shop',learningAim:'Ask politely for fruit using Can I have…?',scenes:[{title:'Meet the shopkeeper',prompt:'A friendly original fox and rabbit at a colourful fruit shop. The fox points at apples.',script:'Can I have an apple, please?',duration:5,question:'What does the fox want?',answer:'An apple.',teacherNotes:'Pause and let learners answer with a partner.'},{title:'Your turn',prompt:'The same fox smiles as the rabbit offers an apple at the fruit shop.',script:'Here you are. Thank you!',duration:5,question:'Ask for your favourite fruit.',answer:'Can I have a banana, please?',teacherNotes:'Pairs take turns being the customer and shopkeeper.'}]}}};
    if(d.action==='share'){await setDoc(doc(db,'videoAssets',d.assetId),{org:d.org,readers:d.readers},{merge:true});return {data:{saved:true}};}
    if(d.action==='cancel') return {data:{status:'cancelled'}};
    if(d.action==='generate') return {data:{jobId:d.requestId,status:'working'}};
    if(d.action==='poll') return {data:{status:'complete',assetId:localStorage.getItem('videoTestSource')}};
    if(d.action==='character'||d.action==='scene') {
      const {getDocs,collection}=await import('./firestore');
      const found=(await getDocs(collection(db,'videoAssets'))).docs.find(x=>x.data().owner===uid&&x.data().kind==='character');
      if(!found)throw Error('Make fixture media first.');
      const data=found.data(),ref=doc(collection(db,'videoAssets'));await setDoc(ref,{...data,name:d.name,description:d.prompt,visualStyle:d.visualStyle,kind:d.action==='scene'?'image':'character',provenance:{provider:'Test stand-in',prompt:d.prompt,references:d.references}});
      for(let n=0;n<data.parts;n++){const part=await getDoc(doc(db,'videoAssets',found.id,'parts',String(n)));await setDoc(doc(db,'videoAssets',ref.id,'parts',String(n)),part.data());}
      return {data:{assetId:ref.id,status:'complete'}};
    }
  }
  if(name==='recordingSongLesson'){
    if(sessionStorage.getItem('mockSongLessonFailure')){sessionStorage.removeItem('mockSongLessonFailure');throw Error('This lesson is no longer available. Choose another lesson.');}
    const data=JSON.parse(localStorage.getItem('mockfs')||'{}'),c=data['classes/'+d.lesson.classId],l=data['classes/'+d.lesson.classId+'/items/'+d.lesson.itemId];
    if(!c||!l)throw Error('This lesson is no longer available.');
    return {data:{reference:d.lesson,title:l.title,className:c.name,level:c.level,audience:c.learningProfile?.ageGroup||'',focus:l.speakingFocus||'Practise the language from this lesson.',tasks:[{title:'Lesson vocabulary',instructions:'Use target words.',text:'Morning routines and daily activities.'}]}};
  }
  if(name==='recordingSongStems'){
    const key='mockSongs',jobs=JSON.parse(sessionStorage.getItem(key)||'{}'),job=jobs[d.id];if(!job)throw Error('Song not found.');
    job.stems={status:'working',progress:.25};sessionStorage.setItem(key,JSON.stringify(jobs));
    const delay=Number(sessionStorage.getItem('mockStemDelayMs')||0);if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    if(sessionStorage.getItem('mockStemFail')){sessionStorage.removeItem('mockStemFail');job.stems={status:'failed',error:'Track preparation failed. Your original song is kept.',progress:0};}else job.stems={status:'complete',progress:1};
    sessionStorage.setItem(key,JSON.stringify(jobs));return {data:{status:job.stems.status}};
  }
  if (['recordingLyrics','recordingSong','recordingSongResult'].includes(name)) {
    const key='mockSongs', jobs=JSON.parse(sessionStorage.getItem(key)||'{}');
    if(name!=='recordingSongResult'){
      localStorage.setItem('mockSongLastRequest',JSON.stringify({name,...d}));
      const delay=Number(sessionStorage.getItem('mockSongDelayMs')||0);if(delay>0)await new Promise(resolve=>setTimeout(resolve,Math.min(delay,5000)));
      if(d.brief.style.includes('FAIL_TEST'))throw Error('Test music service unavailable.');
      jobs[d.id]={kind:name==='recordingLyrics'?'lyrics':'song',lyrics:d.brief.lyrics};sessionStorage.setItem(key,JSON.stringify(jobs));return {data:{status:'complete'}};
    }
    const job=jobs[d.id];if(!job)throw Object.assign(Error('Creation not found. Your lyrics are kept.'),{code:'functions/not-found'});
    if(job.kind==='lyrics')return {data:{status:'complete',lyrics:'Every morning, here we go!\nTime to learn and time to grow!'}};
    if(d.metaOnly)return {data:{status:'complete',stems:job.stems||null}};
    const bytes=new Uint8Array(44+240000),view=new DataView(bytes.buffer),write=(at:number,s:string)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
    write(0,'RIFF');view.setUint32(4,bytes.length-8,true);write(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,24000,true);view.setUint32(28,48000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,240000,true);
    for(let i=0;i<120000;i++)view.setInt16(44+i*2,Math.sin(i*(d.stem==='instrumental'?.05:.1))*(d.stem?1500:3000),true);
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return {data:{status:'complete',audio:btoa(binary),mime:'audio/wav',providerLyrics:job.lyrics,stems:job.stems||null}};
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
  if(d.action==='readiness')return (await import('./learning')).mockReadiness(d);
  if(['taskTools','taskToolsStatus','taskToolsApply'].includes(d.action))return (await import('./lesson-tools')).mockLessonTools(d);
  if(['rebuild','rebuildStatus','importCreate','rebuildPicture','rebuildPictureStatus'].includes(d.action)) {
    const jobs=JSON.parse(localStorage.getItem('mockMaterialJobs')||'{}');
    if(d.action==='rebuild') {let {rebuilt}=await import('../ai/material-fixture.mjs');if(d.source.text.includes('NATIVE_IMPORT_VERIFICATION')){const {importLesson,importElements}=await import('../ai/import-types-fixture.mjs');rebuilt=importLesson(['radio','wordform','pq-highlight','pq-transform','pq-categorise','pq-matching','pq-wordsearch'].map(k=>importElements[k]));}if(d.source.name==='import-shapes.jpg'){const {importLesson,importElements}=await import('../ai/import-types-fixture.mjs');rebuilt=importLesson([{...importElements.picture,data:{...importElements.picture.data,x:0,y:0,width:100,height:100,alt:'One red circle and one blue square.',recreationPrompt:'Retain one red circle on the left and one blue square on the right.'}},importElements.gap]);}const checks=rebuilt.tasks.map(t=>({stageId:t.stageId,status:'passed',summary:'Instructions, interaction and keys compared against the source.',issues:[]}));jobs[d.requestId]={rebuilt,checks,sourcePreviews:d.source.images,pictures:{},creationType:d.creationType,scope:d.scope};localStorage.setItem('mockMaterialJobs',JSON.stringify(jobs));localStorage.setItem('mockMaterialRequest',JSON.stringify(d));return {data:{rebuilt,checks}};}
    const job=jobs[d.requestId];if(!job)throw Error('Import not found');
    if(['rebuildPicture','rebuildPictureStatus'].includes(d.action)){const pictureId='a'.repeat(64),r={pictureId,status:'ready',preview:job.sourcePreviews[d.picture.sourceImage-1],qualityPassed:true,summary:'Source illustration details compared.',issues:[]};job.pictures[pictureId]=r;jobs[d.requestId]=job;localStorage.setItem('mockMaterialJobs',JSON.stringify(jobs));return {data:r};}
    if(d.action==='rebuildStatus')return {data:{...job,status:'completed'}};
    if(JSON.stringify(d.rebuilt.tasks)!==JSON.stringify(job.rebuilt.tasks)){job.rebuilt=d.rebuilt;jobs[d.requestId]=job;localStorage.setItem('mockMaterialJobs',JSON.stringify(jobs));return {data:{rebuilt:d.rebuilt,checks:job.checks,needsReview:true}};}
    const id=d.itemId||'import-'+d.requestId,taskId='import-task-'+d.requestId;
    const {nativeTask}=await import('../../functions/ai/activities.js');
    const {importPicturePlans,resolveImportPictures}=await import('../../functions/ai/import-pictures.js');const plans=importPicturePlans(d.rebuilt),assetUrls:Record<string,string>={};for(const plan of plans){if(plan.asset&&job.pictures[plan.asset]){assetUrls[plan.asset]='media:import_'+plan.asset;await setDoc(doc(db,'classes',d.classId,'media','import_'+plan.asset),{data:job.pictures[plan.asset].preview,type:'image/jpeg',public:false});}}
    if(!d.itemId)await setDoc(doc(db,'classes',d.classId,'items',id),{type:job.creationType,title:d.rebuilt.title,topicId:null,order:20,hidden:true,locked:false,taskCount:d.rebuilt.tasks.length});
    for(const [i,t]of d.rebuilt.tasks.entries()){const n=nativeTask(t,i,taskId);await setDoc(doc(db,'classes',d.classId,'items',id,'tasks',taskId+'_'+i),{kind:'task',title:t.title,instructions:t.instructions,content:resolveImportPictures(n.content,plans,assetUrls),order:20,hidden:false,locked:false});await setDoc(doc(db,'classes',d.classId,'items',id,'tasks',taskId+'_'+i,'private','key'),n.key);await setDoc(doc(db,'classes',d.classId,'items',id,'tasks',taskId,'private','notes'),{text:n.notes});}
    jobs[d.requestId]={...job,createdItemId:id,taskId:taskId+'_0'};localStorage.setItem('mockMaterialJobs',JSON.stringify(jobs));return {data:{createdItemId:id,taskId:taskId+'_0'}};
  }
  if (d.action === 'coach') {
    const { profileComplete, beliefsComplete, contextPermissions } = await import('../../functions/ai/coach-context.js');
    const current = (await import('firebase/auth')).getAuth().currentUser?.uid ?? 'teacher1';
    const p = (await getDoc(doc(db,'teachingCoach',current,'settings','profile'))).data();
    if (!d.lessonContext && !beliefsComplete(p)) throw Error('Add your teaching beliefs before starting a coaching conversation.');
    if (!d.lessonContext && !profileComplete(p)) throw Error('Complete your teaching profile before starting a coaching conversation.');
    localStorage.setItem('mockCoachLastRequest',JSON.stringify(d));
    const prefs = contextPermissions((await getDoc(doc(db,'teachingCoach',current,'settings','context'))).data());
    await new Promise(resolve=>setTimeout(resolve,350));
    return {data:{sources:d.lessonContext?[{title:'Selected activity',url:`/class/${d.lessonContext.classId}/lesson/${d.lessonContext.itemId}`}]:[],journalDraft:/draft.*journal|yes.*journal/i.test(d.prompt)?'I noticed a change in participation. I want to consider other explanations before deciding what to try next.':'',reply:'What did you notice about learners’ responses? What other explanation might fit what happened?',basis:[prefs.profile?'Your professional profile':'',prefs.beliefs&&p?.beliefs?'Your teaching beliefs':''].filter(Boolean)}};
  }
  localStorage.setItem('mockAiLastRequest',JSON.stringify(d));
  if(d.action==='memories') return {data:{memories:[{id:'a:q',name:'Alex',text:'I visited Rome last year.',item:'Travel stories',task:'Your experience'}]}};
  const store = JSON.parse(localStorage.getItem('mockAiDrafts') || '{}');
  if(d.action==='mediaStatus') return {data:{media:[]}};
  if (d.action === 'context') {const c=(await getDoc(doc(db,'classes',d.classId))).data()||{};return {data:{classContext:{name:c.name||'Demo class',level:c.level||'B1',kind:c.kind||'language',profile:c.learningProfile||null,trainingProfile:c.trainingProfile||null},evidence:{recent:[],skillLevels:{},counts:{items:0,submittedTasks:0,portfolioRecords:0},limitations:'No recorded evidence yet.'}}};}
  if (d.action === 'profile') {const c=(await getDoc(doc(db,'classes',d.classId))).data();await setDoc(doc(db,'classes',d.classId),c?.kind==='training'?{trainingProfile:d.trainingProfile,level:d.trainingProfile.programme}:{learningProfile:d.profile,level:d.level},{merge:true});return {data:{profileSaved:true}};}
  if(d.revision){const current=structuredClone(d.revision.current);current.title='Revised travel choice';if(d.action==='activities')localStorage.setItem('mockAiActivities',JSON.stringify({activities:current,type:d.creationType}));return {data:{[d.action]:current,revisionSummary:'Changed the title; kept all other content.'}};}
  const stage = { id: 's1', title: 'Compare options', aim: 'Agree on a choice using reasons', minutes: d.brief.duration, interaction: 'Pairs', activityType:'Speaking · decision', learnerAction:'Compare the two routes and agree on one.', material:'Two travel option cards', outcome:'A shared choice with two reasons' };
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

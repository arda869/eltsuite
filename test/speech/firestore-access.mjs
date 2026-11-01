import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,where} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-ai-access',firestore:{rules:readFileSync('firestore.rules','utf8')}});
try{
  await env.withSecurityRulesDisabled(async c=>{
    const db=c.firestore();
    await setDoc(doc(db,'classes/speech'),{teacherId:'teacher',coTeachers:{co:{role:'co'},viewer:{role:'viewer'}}});
    for(const id of ['learner','peer'])await setDoc(doc(db,'classes/speech/members/'+id),{});
    await setDoc(doc(db,'classes/speech/speakingActivities/task'),{enabled:true});
    for(const uid of ['learner','peer'])await setDoc(doc(db,'classes/speech/speakingActivities/task/sessions/'+uid),{uid,turns:[],feedback:{}});
    await setDoc(doc(db,'speakingCalls/private'),{callId:'private-provider-id'});
  });
  const as=uid=>env.authenticatedContext(uid,{email:uid+'@example.com'}).firestore();
  const path='classes/speech/speakingActivities/task/sessions/learner';
  for(const uid of ['teacher','co','learner'])await assertSucceeds(getDoc(doc(as(uid),path)));
  for(const uid of ['peer','viewer','outsider'])await assertFails(getDoc(doc(as(uid),path)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path)));
  await assertSucceeds(getDocs(query(collection(as('learner'),'classes/speech/speakingActivities/task/sessions'),where('uid','==','learner'))));
  await assertFails(getDocs(collection(as('learner'),'classes/speech/speakingActivities/task/sessions')));
  for(const uid of ['teacher','learner']){
    await assertFails(getDoc(doc(as(uid),'songPrivate/teacher/jobs/song-private')));
    await assertFails(setDoc(doc(as(uid),'songPrivate/teacher/jobs/song-private'),{status:'complete'}));
    await assertFails(getDoc(doc(as(uid),'songUsage/2026-11-01')));
    await assertFails(setDoc(doc(as(uid),'songUsage/2026-11-01'),{song:0}));
    await assertFails(setDoc(doc(as(uid),path),{uid:'learner',feedback:{forged:true}}));
    await assertFails(setDoc(doc(as(uid),'classes/speech/speakingActivities/task'),{enabled:true}));
    await assertFails(getDoc(doc(as(uid),'speakingCalls/private')));
  }
  const owner=env.authenticatedContext('owner',{email:'ardanurioglu@gmail.com'}).firestore();
  const sample={data:'data:audio/mpeg;base64,AAAA',name:'sample.mp3',updatedAt:1};
  await assertSucceeds(setDoc(doc(owner,'voicePreviews/marin'),sample));
  await assertSucceeds(getDoc(doc(as('teacher'),'voicePreviews/marin')));
  await assertFails(setDoc(doc(as('teacher'),'voicePreviews/marin'),sample));
  await assertFails(setDoc(doc(owner,'voicePreviews/unknown'),sample));
  await assertFails(setDoc(doc(owner,'voicePreviews/marin'),{...sample,data:'https://external.example/audio'}));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'voicePreviews/marin')));
  console.log('Speaking privacy checks passed: own attempts only, teachers monitor, no client feedback/config writes, private call IDs.');
}finally{await env.cleanup();}

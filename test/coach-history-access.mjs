import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,deleteDoc} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-coach-history',firestore:{rules:readFileSync('firestore.rules','utf8')}});
try{
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const id of ['teacher','other'])await setDoc(doc(db,'users',id),{role:'teacher'});await setDoc(doc(db,'teachingCoach/teacher/conversations/one'),{title:'Private conversation',updatedAt:1});await setDoc(doc(db,'teachingCoach/teacher/conversations/one/turns/first'),{prompt:'Private question',status:'completed',sequence:1,result:{reply:'Private reply'}});});
 const own=env.authenticatedContext('teacher',{email:'teacher@example.com'}).firestore();
 for(const path of ['teachingCoach/teacher/conversations/one','teachingCoach/teacher/conversations/one/turns/first']){
  await assertSucceeds(getDoc(doc(own,path)));await assertFails(setDoc(doc(own,path),{title:'Forged reply'}));await assertFails(deleteDoc(doc(own,path)));
  for(const ctx of [env.unauthenticatedContext(),env.authenticatedContext('other'),env.authenticatedContext('owner',{email:'ardanurioglu@gmail.com',email_verified:true}),env.authenticatedContext('teacher',{proxyBy:'owner'})])await assertFails(getDoc(doc(ctx.firestore(),path)));
 }
 await assertSucceeds(getDocs(collection(own,'teachingCoach/teacher/conversations')));await assertSucceeds(getDocs(collection(own,'teachingCoach/teacher/conversations/one/turns')));
 console.log('PASS own history readable; foreign teachers, admin, proxy, anonymous reads and client fabrication/deletion denied. Real Firestore emulator.');
}finally{await env.cleanup();}

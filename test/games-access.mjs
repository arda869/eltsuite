import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,collection,getDocs} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-ai-access',firestore:{rules:readFileSync('firestore.rules','utf8')}});
try{
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'users/teacher'),{role:'teacher'});await setDoc(doc(db,'classes/c'),{teacherId:'teacher'});await setDoc(doc(db,'classes/c/members/learner'),{});await setDoc(doc(db,'gameSessions/g'),{target:{type:'class',id:'c'},mode:'individual'});await setDoc(doc(db,'gameSessions/g/players/learner'),{state:{answer:'private answer'}});await setDoc(doc(db,'gameSessions/g/scores/learner'),{name:'Learner',score:10,finished:true});});
 const learner=env.authenticatedContext('learner').firestore(),outsider=env.authenticatedContext('outsider').firestore(),teacher=env.authenticatedContext('teacher',{email:'teacher@example.com'}).firestore();
 await assertSucceeds(getDoc(doc(learner,'gameSessions/g')));await assertSucceeds(getDoc(doc(teacher,'gameSessions/g')));await assertFails(getDoc(doc(outsider,'gameSessions/g')));
 await assertSucceeds(getDoc(doc(learner,'gameSessions/g/players/learner')));await assertFails(getDoc(doc(outsider,'gameSessions/g/players/learner')));
 await assertSucceeds(getDocs(collection(learner,'gameSessions/g/scores')));await assertFails(getDocs(collection(outsider,'gameSessions/g/scores')));
 await assertFails(setDoc(doc(learner,'gameSessions/g/scores/learner'),{score:999}));await assertFails(setDoc(doc(teacher,'gameSessions/g'),{mode:'teacher'}));
 console.log('Games rules: class-only realtime reads, private responses and server-only score writes passed.');
}finally{await env.cleanup();}

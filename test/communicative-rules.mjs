import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc,updateDoc} from 'firebase/firestore';
const env=await initializeTestEnvironment({projectId:'demo-communicative',firestore:{host:'127.0.0.1',port:8097,rules:readFileSync('firestore.rules','utf8')}});
const teacher=env.authenticatedContext('teacher',{email:'teacher@example.test'}).firestore(),a=env.authenticatedContext('a',{email:'a@learners.lesson-lit.firebaseapp.com'}).firestore(),b=env.authenticatedContext('b',{email:'b@learners.lesson-lit.firebaseapp.com'}).firestore(),stranger=env.authenticatedContext('stranger',{email:'stranger@example.test'}).firestore(),guest=env.unauthenticatedContext().firestore();
let count=0;const pass=async(name,p)=>{await assertSucceeds(p);console.log('PASS',name);count++;},deny=async(name,p)=>{await assertFails(p);console.log('PASS',name);count++;};
const root='classes/test',run=root+'/activities/task_activity';
try{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [path,data]of Object.entries({
 'users/teacher':{role:'teacher'},[root]:{teacherId:'teacher',coTeachers:{}},[root+'/members/a']:{learnerId:'la'},[root+'/members/b']:{learnerId:'lb'},[root+'/items/lesson']:{type:'lesson',hidden:false,locked:false},[root+'/items/lesson/tasks/task']:{kind:'task',hidden:false,locked:false,restricted:false,content:{type:'doc',content:[{type:'communicativeActivity',attrs:{id:'activity',kind:'cue',sealed:true},content:[]}]}},[root+'/items/lesson/tasks/task/private/activities']:{nodes:{activity:{secret:'all private cards'}}},[run]:{itemId:'lesson',taskId:'task',activityId:'activity'},[run+'/rooms/class']:{config:{secret:'all private cards'},state:{seq:1}},[run+'/views/a']:{config:{own:'card A'}},[run+'/views/b']:{config:{own:'card B'}},[root+'/comparisons/lesson_task']:{itemId:'lesson',taskId:'task',visible:true},[root+'/comparisons/lesson_task/views/a']:{versions:[{label:'A',text:'First role'},{label:'B',text:'Second role'}]}}))await setDoc(doc(db,path),data);});

 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,root+'/activityMedia/secret'),{type:'image/jpeg',size:9,chunks:1});await setDoc(doc(db,root+'/activityMedia/secret/chunks/0'),{data:'data:image/jpeg;base64,c3ludGhldGlj'});});

 await pass('Teacher can upload an isolated image manifest',setDoc(doc(teacher,root+'/activityMedia/uploaded'),{type:'image/jpeg',size:9,chunks:1}));
 await pass('Teacher can upload isolated image bytes',setDoc(doc(teacher,root+'/activityMedia/uploaded/chunks/0'),{data:'data:image/jpeg;base64,c3ludGhldGlj',bytes:'data:image/jpeg;base64,c3ludGhldGlj'.length}));
 await deny('A teacher cannot understate private image storage bytes',setDoc(doc(teacher,root+'/activityMedia/uploaded/chunks/1'),{data:'actual image bytes',bytes:1}));
 await deny('Oversized isolated chunks are rejected',setDoc(doc(teacher,root+'/activityMedia/uploaded/chunks/1'),{data:'x'.repeat(250001),bytes:250001}));
 await pass('Teacher reads isolated private image manifest',getDoc(doc(teacher,root+'/activityMedia/secret')));
 await pass('Teacher reads isolated private image bytes',getDoc(doc(teacher,root+'/activityMedia/secret/chunks/0')));
 await deny('Learner cannot enumerate private image manifests',getDocs(collection(a,root+'/activityMedia')));
 await deny('Learner cannot read private image manifest by ID',getDoc(doc(a,root+'/activityMedia/secret')));
 await deny('Learner cannot read private image bytes by ID',getDoc(doc(a,root+'/activityMedia/secret/chunks/0')));
 await deny('Learner cannot enumerate private image chunks',getDocs(collection(a,root+'/activityMedia/secret/chunks')));
 await deny('Learner cannot forge private image bytes',setDoc(doc(a,root+'/activityMedia/secret/chunks/0'),{data:'forged'}));
 await pass('Teacher reads canonical room',getDoc(doc(teacher,run+'/rooms/class')));
 await pass('Teacher reads private source cards',getDoc(doc(teacher,root+'/items/lesson/tasks/task/private/activities')));
 await pass('Learner reads own projected card',getDoc(doc(a,run+'/views/a')));
 await pass('Other learner reads own projected card',getDoc(doc(b,run+'/views/b')));
 await deny('Learner cannot read peer card',getDoc(doc(a,run+'/views/b')));
 await deny('Learner cannot enumerate views',getDocs(collection(a,run+'/views')));
 await deny('Learner cannot read canonical room',getDoc(doc(a,run+'/rooms/class')));
 await deny('Learner cannot read private source cards',getDoc(doc(a,root+'/items/lesson/tasks/task/private/activities')));
 await deny('Learner cannot fabricate a score or card',updateDoc(doc(a,run+'/views/a'),{score:999}));
 await deny('Teacher cannot bypass the server to write canonical state',updateDoc(doc(teacher,run+'/rooms/class'),{score:999}));
 await deny('Stranger cannot read a projected card',getDoc(doc(stranger,run+'/views/a')));
 await deny('Signed-out visitor cannot read a projected card',getDoc(doc(guest,run+'/views/a')));
 await pass('Teacher reveal lets an allocated learner read compared versions',getDoc(doc(a,root+'/comparisons/lesson_task/views/a')));
 await deny('A learner cannot open another learner’s comparison',getDoc(doc(b,root+'/comparisons/lesson_task/views/a')));
 await deny('A learner cannot publish comparison content',setDoc(doc(a,root+'/comparisons/lesson_task/views/a'),{versions:[]}));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),root+'/items/lesson/tasks/task'),{hidden:true}));
 await deny('Hidden task revokes own activity read',getDoc(doc(a,run+'/views/a')));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),root+'/items/lesson/tasks/task'),{hidden:false,restricted:true,allowed:['lb']}));
 await deny('Version allocation revokes unallocated learner access',getDoc(doc(a,run+'/views/a')));
 await pass('Allocated learner can still open their own card',getDoc(doc(b,run+'/views/b')));

 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),root+'/items/lesson/tasks/task'),{restricted:false,exam:true}));
 await deny('Exam task revokes activity projection reads',getDoc(doc(a,run+'/views/a')));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),root+'/items/lesson/tasks/task'),{exam:false}));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),root+'/items/lesson'),{type:'exam'}));
 await deny('Exam lesson revokes activity projection reads',getDoc(doc(a,run+'/views/a')));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),root+'/items/lesson'),{type:'lesson'}));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'accounts/a'),{suspended:true}));
 await deny('Suspended learner cannot read own activity',getDoc(doc(a,run+'/views/a')));
 await deny('Suspended learner cannot read revealed comparisons',getDoc(doc(a,root+'/comparisons/lesson_task/views/a')));
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'accounts/teacher'),{suspended:true}));
 await deny('Suspended teacher cannot read canonical room',getDoc(doc(teacher,run+'/rooms/class')));
 await env.withSecurityRulesDisabled(async c=>{const {deleteDoc}=await import('firebase/firestore');await deleteDoc(doc(c.firestore(),root+'/members/b'));});
 await deny('Removed learner cannot read a stale projection',getDoc(doc(b,run+'/views/b')));
 await deny('Learner cannot enumerate canonical rooms',getDocs(collection(a,run+'/rooms')));
 await deny('Teacher cannot directly publish a comparison',setDoc(doc(teacher,root+'/comparisons/lesson_task'),{visible:true}));
 console.log(`${count} real Firestore emulator activity access checks passed.`);
}finally{await env.cleanup();}

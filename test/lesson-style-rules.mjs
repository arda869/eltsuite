// Start the Firestore emulator with this repository's firestore.rules on 127.0.0.1:8089.
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, getDoc, terminate } from 'firebase/firestore';
const projectId='demo-lesson-style';
const [host,portText]=(process.env.STYLE_FIRESTORE_EMULATOR || '127.0.0.1:8089').split(':');const port=Number(portText);
const value=v=>v===null?{nullValue:null}:Array.isArray(v)?{arrayValue:{values:v.map(value)}}:typeof v==='object'?{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,value(x)]))}}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:{stringValue:v};
async function seed(path,data) {
 const res=await fetch(`http://${host}:${port}/v1/projects/${projectId}/databases/(default)/documents/${path}`,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(value(data).mapValue)});
 assert(res.ok,await res.text());
}
await seed('users/teacher1',{role:'teacher'});await seed('users/co',{role:'teacher'});
const initial={teacherId:'teacher1',classCode:'STY-234',name:'Style fixture',themeColor:'flame',coTeachers:{co:{role:'co'},viewer:{role:'viewer'}}};
await seed('classes/style',initial);await seed('classes/style/members/learner',{learnerId:'learner'});
const clients=[];
function as(uid) {const app=initializeApp({projectId},uid);const db=getFirestore(app);connectFirestoreEmulator(db,host,port,{mockUserToken:{sub:uid,email:`${uid}@example.test`,email_verified:true}});clients.push({app,db});return db;}
let passes=0;
async function allowed(name,f){await f();passes++;console.log('PASS',name);}
async function denied(name,f){await assert.rejects(f,e=>e.code==='permission-denied');passes++;console.log('PASS',name);}
try {
 const owner=as('teacher1'),co=as('co'),viewer=as('viewer'),learner=as('learner'),other=as('other');
 await allowed('Existing class with no style remains writable',()=>updateDoc(doc(owner,'classes/style'),{name:'Still Adult'}));
 await allowed('Owner changes Adult → Young',()=>updateDoc(doc(owner,'classes/style'),{lessonStyle:'young'}));
 await allowed('Owner changes Young → Adult',()=>updateDoc(doc(owner,'classes/style'),{lessonStyle:'adult'}));
 await allowed('Co-teacher changes presentation',()=>updateDoc(doc(co,'classes/style'),{lessonStyle:'young'}));
 for(const [name,db] of [['Viewer',viewer],['Learner',learner],['Unrelated teacher',other]]) await denied(`${name} cannot change presentation`,()=>updateDoc(doc(db,'classes/style'),{lessonStyle:'adult'}));
 for(const invalid of ['teen','',null,1,{}]) await denied(`Invalid style ${JSON.stringify(invalid)} rejected on update`,()=>updateDoc(doc(owner,'classes/style'),{lessonStyle:invalid}));
 for(const style of ['adult','young']) await allowed(`Create ${style} class`,()=>setDoc(doc(owner,`classes/new-${style}`),{teacherId:'teacher1',classCode:`NEW-${style}`,name:'New class',lessonStyle:style}));
 await allowed('Legacy create without style accepted',()=>setDoc(doc(owner,'classes/new-legacy'),{teacherId:'teacher1',classCode:'NEW-legacy',name:'Legacy'}));
 await denied('Teen style rejected on create',()=>setDoc(doc(owner,'classes/new-teen'),{teacherId:'teacher1',classCode:'NEW-teen',name:'New class',lessonStyle:'teen'}));
 await allowed('Learner can read class preference',async()=>assert.equal((await getDoc(doc(learner,'classes/style'))).data().lessonStyle,'young'));
 console.log(`${passes} rule checks passed`);
} finally {for(const {app,db} of clients){await terminate(db);await deleteApp(app);}}

import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {generate} from '../ai/provider.js';
import {canPlan} from '../ai/contract.js';
import {usageContext,chargeFeature} from '../ai/feature-usage.js';
import {checkModel,reserveBudget,settleBudget} from '../ai/budget.js';
import {definitionInput,definitionSchema,definitionInstructions,checkDefinition,plainText,levels,illustrationInstructions} from './contract.js';
import {definitionStyle,prepareDefinitionPicture} from './pictures.js';
const key=defineSecret('OPENAI_API_KEY');
export async function draftDefinition(req,{db=getFirestore(),apiKey,generateImpl=generate,generateImage}={}) {
 if(!req.auth||req.auth.token.proxyBy)throw new HttpsError('unauthenticated','Sign in with your own teacher account.');
 if(req.data?.action!==undefined&&req.data.action!=='picture')throw new HttpsError('invalid-argument','Choose a valid definition action.');
 let input;try{input=definitionInput(req.data??{});}catch(e){throw new HttpsError('invalid-argument',e.message);}
 const uid=req.auth.uid,[p,a]=await Promise.all([db.doc('users/'+uid).get(),db.doc('accounts/'+uid).get()]);
 if(p.get('role')!=='teacher'||a.get('suspended')===true||a.get('over')===true)throw new HttpsError('permission-denied','Definitions are available to active teacher accounts.');
 let profile={level:input.level,ageGroup:'Not specified'},lesson=null,languages=[],kind='';
 if(input.classId){
  const cls=await db.doc('classes/'+input.classId).get();
  if(!canPlan(uid,p.data(),a.data(),cls.data()))throw new HttpsError('permission-denied','You need teaching access to this class.');
  kind=cls.get('kind')||'';
  profile={level:levels.includes(cls.get('level'))?cls.get('level'):input.level,ageGroup:String(cls.get('learningProfile.ageGroup')??'Not specified').slice(0,60),courseType:String(cls.get('learningProfile.courseType')??'').slice(0,100)};
  languages=(Array.isArray(cls.get('langs'))?cls.get('langs'):[]).filter(v=>typeof v==='string'&&v.length<=60).slice(0,8);
  if(input.lessonId){
   const ref=cls.ref.collection('items').doc(input.lessonId),item=await ref.get();
   if(!item.exists)throw new HttpsError('not-found','This lesson is no longer available.');
   const tasks=await ref.collection('tasks').orderBy('order').limit(8).get();
   lesson={title:String(item.get('title')??'').slice(0,160),tasks:tasks.docs.map(t=>({title:String(t.get('title')??'').slice(0,120),instructions:plainText(t.get('instructions'),500),text:plainText(t.get('content'),1200)}))};
  }
 }
 checkModel('gpt-6.1-sol');
 const policy=await usageContext(db,req.auth),job=db.doc(`aiPrivate/${uid}/jobs/definition_${req.data.requestId}`),budget=db.doc(`definition${policy.isAdmin?'Admin':''}Budgets/${policy.day.slice(0,7)}`),fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const reservation=await db.runTransaction(async tx=>{
  const [old,b]=await Promise.all([tx.get(job),tx.get(budget)]);
  if(old.exists){if(old.get('fingerprint')!==fingerprint)throw new HttpsError('invalid-argument','Start a new request for the changed word or context.');if(old.get('status')==='complete')return {saved:old.get('result')};throw new HttpsError('failed-precondition','That definition request is still running or did not finish. Your current fields are kept.');}
  if(req.data.action==='picture')throw new HttpsError('failed-precondition','Create the definition before retrying its picture.');
  const r=reserveBudget(b.get('committedMicroUsd')??0,1,policy.isAdmin);await chargeFeature(tx,db,policy,'definitions');
  tx.set(budget,{committedMicroUsd:r.balance});tx.set(job,{fingerprint,action:'definition',classId:input.classId,status:'working',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});return r;
 });
 if(reservation.saved)return req.data.action==='picture'?prepareDefinitionPicture({db,job,policy,apiKey,result:reservation.saved,generateImage}):reservation.saved;
 try{
  const r=await generateImpl({apiKey,model:'gpt-6.1-sol',schema:definitionSchema,name:'teaching_definition',instructions:definitionInstructions+'\n'+illustrationInstructions,input:{word:input.word,surroundingText:input.context,teacherFocus:input.focus,learners:profile,lesson,translationLanguages:languages}});
  const value=checkDefinition(r.value,languages),result={...value,level:profile.level,ageGroup:profile.ageGroup,requestId:req.data.requestId,picture:{status:input.hasImage?'existing':!value.illustration.useful||value.needsContext?'not-needed':'pending',style:definitionStyle(profile,kind)}};
  await db.runTransaction(async tx=>{const b=await tx.get(budget);tx.set(budget,{committedMicroUsd:settleBudget(b.get('committedMicroUsd'),reservation.reserved,[r.usage]).balance});tx.update(job,{status:'complete',result});});
  return await prepareDefinitionPicture({db,job,policy,apiKey,result,generateImage});
 }catch(e){await job.update({status:'failed'}).catch(()=>{});throw new HttpsError('unavailable','We couldn’t draft this definition. Your fields are kept. Check the context and try again, or contact support.');}
}
export const teachingDefinition=onCall({region:'us-central1',secrets:[key],maxInstances:2,concurrency:4,timeoutSeconds:540},req=>draftDefinition(req,{apiKey:key.value()}));

// Temporary, read-only production diagnosis. Never print prompts, scripts, tokens or credentials.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');

initializeApp({projectId:'lesson-lit'});
const db=getFirestore();
const classId='uJlrPEXiArJiZda43ZGr';
const itemId='yKAYfEsnQ0YGbJv80VJf';
const cls=await db.doc(`classes/${classId}`).get();
if(!cls.exists)throw Error('B-019 class missing');
const uid=cls.get('teacherId');
if(typeof uid!=='string'||!uid)throw Error('B-019 class teacher missing');
const jobs=await db.collection(`aiPrivate/${uid}/jobs`).orderBy('createdAt','desc').limit(35).get();
let found=0;
for(const job of jobs.docs){
 const j=job.data();
 if(j.action!=='taskTools'||j.classId!==classId||j.itemId!==itemId)continue;
 if((j.createdAt?.toMillis?.()??0)<Date.parse('2026-11-15T07:30:00Z'))continue;
 found++;
 console.log('job',JSON.stringify({status:j.status,mode:j.mode,createdAt:j.createdAt?.toDate?.()?.toISOString(),error:j.error??''}));
 const media=await job.ref.collection('media').get();
 for(const asset of media.docs){
  const a=asset.data();
  console.log('media',JSON.stringify({status:a.status,kind:a.kind,source:a.source??'',error:a.error??'',completedLines:a.completedLines??0,lineCount:Array.isArray(a.lines)?a.lines.length:0,startedAt:a.startedAt?.toDate?.()?.toISOString(),failedAt:a.failedAt?.toDate?.()?.toISOString()}));
 }
}
if(!found)console.log('No matching recent B-019 taskTools job in last 35 jobs.');

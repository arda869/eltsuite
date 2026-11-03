import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {getFirestore} from 'firebase-admin/firestore';
import {isGenerationAdmin} from '../ai/allowance.js';
import {AI_FEATURES} from '../ai/features.js';
import {costReport} from './report.js';
import {RATE_CARD,PRICING_VERSION,SOURCES} from './pricing.js';
export function validateSettings(data) {
 if(!data.proposed||typeof data.proposed!=='object'||Array.isArray(data.proposed)||Object.entries(data.proposed).some(([k,v])=>!AI_FEATURES.some(f=>f.id===k)||!Number.isSafeInteger(v)||v<0||v>1000000))throw new HttpsError('invalid-argument','Proposed prices must be whole credits between 0 and 1,000,000.');
 for(const k of ['dailyGlobalMicroUsd','dailyTeacherMicroUsd'])if(!Number.isSafeInteger(data[k])||data[k]<1000000||data[k]>1000000000000)throw new HttpsError('invalid-argument','Use daily spending safeguards between $1 and $1,000,000.');
 if(typeof data.paused!=='boolean'||!Number.isSafeInteger(data.version)||data.version<0)throw new HttpsError('invalid-argument','Reload settings before saving.');
 return {proposed:data.proposed,dailyGlobalMicroUsd:data.dailyGlobalMicroUsd,dailyTeacherMicroUsd:data.dailyTeacherMicroUsd,paused:data.paused,version:data.version+1};
}
export async function costAdmin(db,auth,data={}) {
 if(!await isGenerationAdmin(db,auth))throw new HttpsError('permission-denied','Only verified super admins can view AI costs.');
 const settingsRef=db.doc('aiCostSettings/control');
 if(data.action==='save'){
  const next=validateSettings(data);
  await db.runTransaction(async tx=>{const s=await tx.get(settingsRef);if((s.get('version')??0)!==data.version)throw new HttpsError('aborted','Another admin changed these settings. Reload before saving.');tx.set(settingsRef,{...next,updatedBy:auth.uid,updatedAt:Date.now()});tx.create(db.collection('aiCostSettingsAudit').doc(),{...next,updatedBy:auth.uid,updatedAt:Date.now()});});
 }else if(data.action!=='report')throw new HttpsError('invalid-argument','Choose a cost report action.');
 const settings=(await settingsRef.get()).data()??{proposed:{},version:0,dailyGlobalMicroUsd:1000000000,dailyTeacherMicroUsd:250000000,paused:false};
 if(data.action==='save')return {settings};
 const end=data.end??new Date().toISOString().slice(0,10),start=data.start??new Date(Date.now()-29*86400000).toISOString().slice(0,10);
 if(![start,end].every(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)||start>end||Date.parse(end)-Date.parse(start)>92*86400000)throw new HttpsError('invalid-argument','Choose a valid date range of up to 93 days.');
 const as=await db.collection('aiCostAttempts').where('day','>=',start).where('day','<=',end).limit(10001).get();
 if(as.size>10000)throw new HttpsError('resource-exhausted','This range contains more than 10,000 records. Choose a shorter date range for complete statistics.');
 const selected=as.docs.map(d=>({id:d.id,...d.data()})),ids=[...new Set(selected.map(a=>a.generationId))],generations=[],attempts=[];
 // A resumed generation can cross midnight. Fetch its full lifecycle for price statistics,
 // while the expenditure breakdown uses only provider calls inside the chosen date range.
 for(let i=0;i<ids.length;i+=30){
  const batch=ids.slice(i,i+30),gs=await db.getAll(...batch.map(id=>db.doc('aiCostGenerations/'+id)));
  generations.push(...gs.filter(d=>d.exists).map(d=>({id:d.id,...d.data()})));
  const all=await db.collection('aiCostAttempts').where('generationId','in',batch).limit(10001).get();
  attempts.push(...all.docs.map(d=>({id:d.id,...d.data()})));
  if(attempts.length>10000)throw new HttpsError('resource-exhausted','Complete generation histories exceed 10,000 calls. Choose a shorter date range.');
 }

 return {...costReport(generations,attempts,settings.proposed,selected),settings,start,end,pricingVersion:PRICING_VERSION,rates:RATE_CARD,sources:SOURCES,records:selected.sort((a,b)=>b.startedAt-a.startedAt).slice(0,100).map(({guardPaths,...r})=>r)};
}
export const adminAiCosts=onCall({region:'us-central1',maxInstances:2,timeoutSeconds:60},req=>costAdmin(getFirestore(),req.auth,req.data));

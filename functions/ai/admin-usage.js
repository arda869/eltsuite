import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { AI_FEATURES, validateLimits } from './feature-usage.js';
import { isGenerationAdmin } from './allowance.js';
export const adminAiUsage=onCall({region:'us-central1',maxInstances:2,timeoutSeconds:30},async req=>{
 if(!req.auth)throw new HttpsError('unauthenticated','Sign in with your own super-admin account.');
 const db=getFirestore();
 if(!await isGenerationAdmin(db,req.auth))throw new HttpsError('permission-denied','Only verified super admins can manage AI allowances.');
 const {uid,action,limits,version}=req.data??{};
 if(typeof uid!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(uid))throw new HttpsError('invalid-argument','Choose a user.');
 let account;try{account=await getAuth().getUser(uid);}catch{throw new HttpsError('not-found','This account no longer exists.');}
 const isAdmin=await isGenerationAdmin(db,{uid,token:{email:account.email,email_verified:account.emailVerified}});
 const ref=db.doc('aiAllowances/'+uid),day=new Date().toISOString().slice(0,10);
 if(action==='save'){
  if(isAdmin)throw new HttpsError('failed-precondition','Super admins always have unlimited AI use.');
  validateLimits(limits);
  if(!Number.isSafeInteger(version)||version<0)throw new HttpsError('invalid-argument','Reload this user’s allowances before saving.');
  await db.runTransaction(async tx=>{const p=await tx.get(ref);if((p.get('version')??0)!==version)throw new HttpsError('aborted','Another admin changed these allowances. Reload the user before saving.');tx.set(ref,{limits,version:version+1,updatedBy:req.auth.uid,updatedAt:Date.now()});});
 }else if(action!=='get')throw new HttpsError('invalid-argument','Choose an allowance action.');
 const [p,u]=await Promise.all([ref.get(),db.doc('aiFeatureUsage/'+uid+'/days/'+day).get()]);
 return {features:AI_FEATURES,limits:p.get('limits')??{},version:p.get('version')??0,counts:u.get('counts')??{},day,isAdmin};
});

// A disabled account lets the published admin form be tested without changing a real user's limits.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,applicationDefault}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const action=process.argv[2],uid='elt-ai-usage-verification-v1',email='ai-usage-verification@eltsuite.invalid',marker='ai-allowances-v1';
if(!['create','cleanup'].includes(action))throw Error('Choose create or cleanup.');
initializeApp({credential:applicationDefault(),projectId:'lesson-lit'});
const db=getFirestore(),auth=getAuth(),ref=db.doc('users/'+uid),profile=await ref.get();
let user;try{user=await auth.getUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
if((profile.exists&&profile.get('_verification')!==marker)||(user&&user.email!==email))throw Error('Verification identity collision; no records changed.');
if(action==='create'){
 if(!user)await auth.createUser({uid,email,emailVerified:true,disabled:true,displayName:'AI allowance verification (disabled test account)'});
 else if(!user.disabled)throw Error('Verification account must remain disabled.');
 if(!profile.exists)await ref.set({role:'teacher',displayName:'AI allowance verification (disabled test account)',email,_verification:marker,createdAt:Timestamp.now()});
 console.log('Disabled verification account ready. No password, sign-in, invitation or generation was created. UID: '+uid);
}else{
 if(profile.exists)await db.recursiveDelete(ref);
 await db.recursiveDelete(db.doc('aiAllowances/'+uid));
 await db.recursiveDelete(db.doc('aiFeatureUsage/'+uid));
 if(user)await auth.deleteUser(uid);
 console.log('Temporary AI allowance verification identity and policy removed.');
}
await db.terminate();

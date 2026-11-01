// Isolated, passwordless identity for the published grant → course → lesson journey.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,applicationDefault}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const action=process.argv[2],uid='elt-trainer-verification-v1',email='trainer-verification@eltsuite.invalid',marker='trainer-access-v1';
if(!['create','cleanup'].includes(action))throw Error('Choose create or cleanup.');
initializeApp({credential:applicationDefault(),projectId:'lesson-lit'});
const db=getFirestore(),auth=getAuth(),ref=db.doc('users/'+uid),profile=await ref.get();
let user;try{user=await auth.getUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
if((profile.exists&&profile.get('_verification')!==marker)||(user&&user.email!==email))throw Error('Verification identity collision; no records changed.');
if(action==='create'){
 if(!user)await auth.createUser({uid,email,emailVerified:true,displayName:'Trainer access verification'});
 if(!profile.exists)await ref.set({role:'teacher',displayName:'Trainer access verification',email,_verification:marker,createdAt:Timestamp.now()});
 console.log('Isolated teacher ready. No password, invitation, email or AI allowance created. Open this teacher through Super Admin to verify. UID: '+uid);
}else{
 const classes=await db.collection('classes').where('teacherId','==',uid).get();
 for(const c of classes.docs){const code=c.get('classCode');if(code){const r=db.doc('classCodes/'+code),s=await r.get();if(s.get('teacherId')===uid)await r.delete();}await db.recursiveDelete(c.ref);}
 if(profile.exists)await db.recursiveDelete(ref);
 await db.recursiveDelete(db.doc('accounts/'+uid));
 if(user)await auth.deleteUser(uid);
 console.log('Only the marked verification teacher and its test courses were removed.');
}
await db.terminate();

// Real Firebase Auth SDK + local Auth emulator. No production accounts or secrets.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithCredential,GoogleAuthProvider,updatePassword,reload,signOut,signInWithEmailAndPassword} from 'firebase/auth';
if(!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Auth emulator required');
const app=initializeApp({projectId:'demo-ai-access',apiKey:'test-only'}),auth=getAuth(app);
connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
const part=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=part({alg:'none',typ:'JWT'})+'.'+part({sub:'friday-google-teacher',email:'friday-password@example.test',email_verified:true,name:'Friday teacher',iss:'https://accounts.google.com',aud:'demo-ai-access',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})+'.';
try{
 const google=GoogleAuthProvider.credential(token);const original=(await signInWithCredential(auth,google)).user.uid;
 await updatePassword(auth.currentUser,'Emulator-only-password-123');await reload(auth.currentUser);
 assert.deepEqual(new Set(auth.currentUser.providerData.map(p=>p.providerId)),new Set(['google.com','password']));
 await signOut(auth);assert.equal((await signInWithEmailAndPassword(auth,'friday-password@example.test','Emulator-only-password-123')).user.uid,original);
 await signOut(auth);assert.equal((await signInWithCredential(auth,google)).user.uid,original);
 console.log('PASS: Google identity -> add password -> password sign-in -> Google sign-in retain the same UID (real SDK, emulator only).');
}finally{await deleteApp(app);}

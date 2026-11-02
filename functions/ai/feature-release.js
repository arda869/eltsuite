import { HttpsError } from 'firebase-functions/v2/https';
import { AI_FEATURES } from './features.js';
const ids=new Set(AI_FEATURES.map(f=>f.id));
export function validateReleases(states){
 if(!states||typeof states!=='object'||Array.isArray(states)||Object.entries(states).some(([id,state])=>!ids.has(id)||!['live','testing','off'].includes(state)))throw new HttpsError('invalid-argument','Choose Live, Testing or Off for a recognised AI feature.');
 return states;
}
export function validateTestingAccess(features){
 if(!Array.isArray(features)||features.length>ids.size||features.some(id=>!ids.has(id))||new Set(features).size!==features.length)throw new HttpsError('invalid-argument','Choose recognised testing features without duplicates.');
 return features;
}
export function checkFeatureRelease(feature,states,testingAccess,isAdmin=false){
 if(!ids.has(feature))throw new HttpsError('internal','Unknown AI feature.');
 if(isAdmin)return;
 const state=states?.[feature]??'live';
 if(state==='live'||state==='testing'&&Array.isArray(testingAccess)&&testingAccess.includes(feature))return;
 throw new HttpsError('permission-denied',state==='testing'?'This AI feature is in testing. Ask your administrator for testing access.':'This AI feature is currently turned off. Your saved work remains available.');
}

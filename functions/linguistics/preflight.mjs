// Metadata only; publishing the manual tools must not require a corpus subscription.
import {applicationDefault,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {readFileSync,writeFileSync} from 'node:fs';
import {corpusConfiguration} from './corpus.js';
initializeApp({projectId:'lesson-lit'});
const config=corpusConfiguration((await getFirestore().doc('admin/corpus').get()).data(),true);
let connected=false;
if(config.available){
 const {access_token}=await applicationDefault().getAccessToken();
 const r=await fetch('https://secretmanager.googleapis.com/v1/projects/lesson-lit/secrets/SKETCH_ENGINE_API_KEY/versions/latest',{headers:{Authorization:`Bearer ${access_token}`},signal:AbortSignal.timeout(30000)});
 if(r.ok)connected=(await r.json()).state==='ENABLED';
 else if(r.status!==404)throw Error(`Corpus secret metadata could not be checked (${r.status}).`);
}
const file='functions/.env.lesson-lit';
const previous=readFileSync(file,'utf8').replace(/^ELT_CORPUS_CONNECTED=.*\n?/gm,'');
writeFileSync(file,previous+`ELT_CORPUS_CONNECTED=${connected}\n`);
console.log(connected?'Corpus secret metadata and licence configuration found. Deployed binding and authentication still require verification.':'Corpus search remains unavailable. Manual evidence investigations can be published without a provider key.');

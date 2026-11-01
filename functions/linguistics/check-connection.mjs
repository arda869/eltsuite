// Read-only configuration, deployed binding and corpus metadata authentication checks.
// No generation, account changes, secret values or provider bodies are logged.
import {applicationDefault,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {corpusConfiguration} from './corpus.js';
async function main(){
 initializeApp({projectId:'lesson-lit'});
 const {access_token}=await applicationDefault().getAccessToken();
 const google=async url=>{const r=await fetch(url,{headers:{Authorization:`Bearer ${access_token}`},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Cloud metadata request failed.');return r.json();};
 const fn=await google('https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/appliedLinguistics');
 const connected=fn.serviceConfig?.environmentVariables?.ELT_CORPUS_CONNECTED==='true';
 const config=corpusConfiguration((await getFirestore().doc('admin/corpus').get()).data(),connected);
 if(!config.available){console.log('Optional Sketch Engine is not configured. Tatoeba sentence search needs no secret; verify its published search and save journey separately.');return;}
 const secret='https://secretmanager.googleapis.com/v1/projects/lesson-lit/secrets/SKETCH_ENGINE_API_KEY/versions/latest';
 const metadata=await google(secret),version=metadata.name.split('/').at(-1);
 const bound=fn.serviceConfig?.secretEnvironmentVariables?.find(s=>s.key==='SKETCH_ENGINE_API_KEY');
 const report={enabled:metadata.state==='ENABLED',bindingMatches:bound?.version==='latest'||bound?.version===version,connected,authenticated:false};
 if(!report.enabled||!report.bindingMatches)throw Error('The deployed corpus secret binding needs correction.');
 const payload=await google(secret+':access'),key=Buffer.from(payload.payload.data,'base64').toString('utf8');
 const url=new URL('https://api.sketchengine.eu/search/corp_info');url.searchParams.set('corpname',config.corpora[0].id);url.searchParams.set('format','json');
 const r=await fetch(url,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000)});
 report.providerHttpStatus=r.status;
 report.authenticated=r.ok&&!(await r.json()).error;
 console.log(JSON.stringify(report));
 if(!report.authenticated)process.exitCode=1;
}
main().catch(()=>{console.error('The corpus connection check did not complete. Check deployed binding and entitlement before replacing a credential. No secrets were printed.');process.exitCode=1;});

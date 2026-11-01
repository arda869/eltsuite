// Inspect metadata only. A missing Runway connection must not prevent publishing the editor.
import { applicationDefault } from 'firebase-admin/app';
import { appendFileSync } from 'node:fs';
const {access_token}=await applicationDefault().getAccessToken();
const response=await fetch('https://secretmanager.googleapis.com/v1/projects/lesson-lit/secrets/RUNWAYML_API_SECRET/versions/latest',{headers:{Authorization:`Bearer ${access_token}`},signal:AbortSignal.timeout(30000)});
let connected=false;
if(response.ok)connected=(await response.json()).state==='ENABLED';
else if(response.status!==404)throw Error(`Could not check the Runway connection metadata (${response.status}).`);
appendFileSync('functions/.env.lesson-lit',`VIDEO_PLANNING_ENABLED=true\nVIDEO_AI_ENABLED=${connected}\n`);
console.log(connected?'Runway secret metadata found. Video generation will be available.':'Runway is not connected. Publishing editing, embedding and script planning; video generation stays disabled.');

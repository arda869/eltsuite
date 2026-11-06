// Authenticate the exact deployed binding without requesting image or text generation.
import {applicationDefault} from 'firebase-admin/app';
async function main(){
 const {access_token}=await applicationDefault().getAccessToken();
 const google=async url=>{const r=await fetch(url,{headers:{Authorization:`Bearer ${access_token}`},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Cloud configuration check failed');return r.json();};
 const fn=await google('https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/classroomGameDraft');
 const binding=fn.serviceConfig?.secretEnvironmentVariables?.find(v=>v.key==='OPENAI_API_KEY');
 if(!binding?.secret||!binding.version)throw Error('Game AI has no deployed API binding');
 const secret=`https://secretmanager.googleapis.com/v1/projects/${binding.projectId||'lesson-lit'}/secrets/${binding.secret}/versions/${binding.version}`;
 const meta=await google(secret);if(meta.state!=='ENABLED')throw Error('Bound version is not enabled');
 const payload=await google(secret+':access');
 const key=Buffer.from(payload.payload.data,'base64').toString('utf8');
 const response=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Provider authentication check failed');
 console.log('Game AI: deployed binding enabled; provider authentication accepted. No generation requested.');
 const draft=await fetch('https://us-central1-lesson-lit.cloudfunctions.net/classroomGameDraft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{id:'deploy-check'}}),signal:AbortSignal.timeout(30000)});
 if(draft.status!==401)throw Error('Signed-out draft request was not rejected');
 // Guests play the quiz show without an account, so it answers signed-out calls, but never lets one host.
 const quiz=await fetch('https://us-central1-lesson-lit.cloudfunctions.net/quizShow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{action:'host',source:{kind:'doc',id:'deploy-check'}}}),signal:AbortSignal.timeout(30000)});
 const body=await quiz.json().catch(()=>({}));
 if(quiz.status!==403||body.error?.status!=='PERMISSION_DENIED')throw Error('Signed-out quiz hosting was not refused');
 console.log('Game drafts reject signed-out requests; the quiz show refuses signed-out hosting.');
}
main().catch(()=>{console.error('Game connection check failed. No secret values or provider response bodies were printed.');process.exitCode=1;});

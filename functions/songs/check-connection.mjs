// Read-only deployed-binding and authentication check. No generation; no secret output.
import {applicationDefault} from 'firebase-admin/app';
async function main(){
 const {access_token}=await applicationDefault().getAccessToken();
 const google=async url=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+access_token},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Cloud connection metadata check failed: '+r.status);return r.json();};
 const fn=await google('https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/recordingLyrics');
 const bound=fn.serviceConfig?.secretEnvironmentVariables?.find(x=>x.key==='OPENAI_API_KEY');
 if(!bound||bound.secret!=='OPENAI_API_KEY'||!bound.version)throw Error('The deployed lyric function is missing its API secret binding. No credential replacement was attempted.');
 const latest=await google('https://secretmanager.googleapis.com/v1/projects/lesson-lit/secrets/OPENAI_API_KEY/versions/latest');
 const latestVersion=latest.name.split('/').at(-1),version=bound.version;
 const meta=await google('https://secretmanager.googleapis.com/v1/projects/lesson-lit/secrets/OPENAI_API_KEY/versions/'+version);
 const payload=await google(meta.name.startsWith('projects/')?'https://secretmanager.googleapis.com/v1/'+meta.name+':access':'');
 const key=Buffer.from(payload.payload.data,'base64').toString('utf8');
 const response=await fetch('https://api.openai.com/v1/models/gpt-6.1-sol',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(30000)});
 const report={function:'recordingLyrics',secretBound:true,secretEnabled:meta.state==='ENABLED',deployedVersion:version,latestVersion,versionMatches:version==='latest'||version===latestVersion,nonBillableModelAuthenticationStatus:response.status,authenticated:response.ok};
 console.log(JSON.stringify(report,null,2));console.log('No generation request was made. No secret values, headers, provider bodies or account details were printed.');
 if(!report.secretEnabled||!report.versionMatches||!report.authenticated)process.exitCode=1;
}
main().catch(()=>{console.error('The private lyric connection check could not complete. No secret values were printed.');process.exitCode=1;});

import { pathToFileURL } from 'node:url';

// Read-only diagnostics. Never return keys, provider bodies, headers, or account details.
export async function inspectRunwayKey(raw, fetchImpl = fetch) {
  const key=raw.trim();
  const result={formatValid:/^key_[0-9a-f]{128}$/.test(key),outerWhitespace:raw!==key,bearerPrefix:/^Bearer\s/i.test(key),quoted:/^["']/.test(key),providerHttpStatus:null,accepted:false};
  if(!result.formatValid)return result;
  try{
    const response=await fetchImpl('https://api.dev.runwayml.com/v1/organization',{
      headers:{Authorization:`Bearer ${key}`,'X-Runway-Version':'2024-11-06'},signal:AbortSignal.timeout(30000),
    });
    result.providerHttpStatus=response.status;
    result.accepted=response.ok;
    if(response.ok){const body=await response.json();result.hasCredits=typeof body.creditBalance==='number'&&body.creditBalance>0;}
  }catch{result.connectionUnavailable=true;}
  return result;
}

async function main(){
  const {applicationDefault}=await import('firebase-admin/app');
  const {access_token}=await applicationDefault().getAccessToken();
  const google=async url=>{
    const response=await fetch(url,{headers:{Authorization:`Bearer ${access_token}`},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('Cloud metadata check failed');
    return response.json();
  };
  const secret='https://secretmanager.googleapis.com/v1/projects/lesson-lit/secrets/RUNWAYML_API_SECRET/versions/latest';
  const metadata=await google(secret);
  const version=metadata.name.split('/').at(-1);
  const fn=await google('https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/videoStudio');
  const bound=fn.serviceConfig?.secretEnvironmentVariables?.find(s=>s.key==='RUNWAYML_API_SECRET');
  const report={secretVersion:version,enabled:metadata.state==='ENABLED',deployedVersion:bound?.version||null,versionMatches:bound?.version===version,videoEnabled:fn.serviceConfig?.environmentVariables?.VIDEO_AI_ENABLED==='true'};
  if(report.enabled){
    const payload=await google(secret+':access');
    const key=Buffer.from(payload.payload.data,'base64').toString('utf8');
    Object.assign(report,await inspectRunwayKey(key));
  }
  console.log(JSON.stringify(report,null,2));
  console.log('Read-only connection check. No generation request was made. Secret values and account details were not printed.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(()=>{console.error('The private connection check could not complete. No secret values were printed.');process.exitCode=1;});
}

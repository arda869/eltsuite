// Deployment metadata only: never retrieve or print secret values.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {GoogleAuth}=require('google-auth-library');
const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
const client=await auth.getClient();
const {data}=await client.request({url:'https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/designerImage'});
const binding=data.serviceConfig?.secretEnvironmentVariables?.find(v=>v.key==='OPENAI_API_KEY');
if(!binding?.secret||!binding.version)throw Error('Designer has no deployed image API secret binding.');
console.log('Designer deployed secret binding verified. No secret value was retrieved.');

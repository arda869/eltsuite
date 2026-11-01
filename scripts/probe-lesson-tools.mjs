// Controlled integration probe: synthetic content only, no learner data or secret output.
import {createRequire} from 'node:module';
import {generate} from '../functions/ai/provider.js';
import {PILOT_MODEL} from '../functions/ai/budget.js';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {GoogleAuth}=require('google-auth-library');
const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
const {data:fn}=await client.request({url:'https://cloudfunctions.googleapis.com/v2/projects/lesson-lit/locations/us-central1/functions/lessonAssistant'});
const binding=fn.serviceConfig?.secretEnvironmentVariables?.find(v=>v.key==='OPENAI_API_KEY');
if(!binding?.secret||!binding.version)throw Error('Deployed secret binding missing');
console.log('Deployed lessonAssistant key binding verified.');
const {data:secret}=await client.request({url:'https://secretmanager.googleapis.com/v1/projects/'+binding.projectId+'/secrets/'+binding.secret+'/versions/'+binding.version+':access'});
const apiKey=Buffer.from(secret.payload.data,'base64').toString('utf8');
const auth=await fetch('https://api.openai.com/v1/models/'+PILOT_MODEL,{headers:{Authorization:'Bearer '+apiKey}});
if(!auth.ok)throw Error('Non-billable model authentication status '+auth.status);
console.log('Non-billable model authentication passed.');
const text={type:'string',maxLength:2500};
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const array=(items,maxItems=100)=>({type:'array',items,maxItems});
const schema=obj({entries:array(obj({taskId:text,questionId:text,answerJson:{type:'string',maxLength:18000},reason:text})),issues:array(text,30)});
try {
const result=await generate({apiKey,model:PILOT_MODEL,schema,name:'task_keys',fetchImpl:async(url,options)=>{const request=JSON.parse(options.body);request.max_output_tokens=2000;const response=await fetch(url,{...options,body:JSON.stringify(request)});if(!response.ok){const failure=await response.clone().json().catch(()=>({}));console.log('Provider status='+response.status+' code='+String(failure.error?.code??'unknown').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80));for(const name of ['retry-after','x-ratelimit-limit-requests','x-ratelimit-limit-tokens','x-ratelimit-remaining-requests','x-ratelimit-remaining-tokens','x-ratelimit-reset-requests','x-ratelimit-reset-tokens'])console.log(name+': '+String(response.headers.get(name)??'absent').replace(/[^0-9a-zA-Z. -]/g,'').slice(0,80));const m=String(failure.error?.message??'');console.log('Limit category: '+(/per day|requests per day|RPD/i.test(m)?'daily requests':/tokens per min|TPM/i.test(m)?'tokens per minute':/requests per min|RPM/i.test(m)?'requests per minute':'other'));}return response;},input:{sourceTasks:[{id:'test',title:'Past tense',instructions:'Complete with the past form of go.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Yesterday I '},{type:'gap',attrs:{id:'gap'}},{type:'text',text:' to the park.'}]}]}}],missingAnswers:[{taskId:'test',questionId:'gap',type:'gap'}]},instructions:'Return the missing answer with taskId test, questionId gap, answerJson as JSON containing answers array. Use went. Empty issues.'});
console.log('Real provider key schema passed; entries='+result.value.entries.length);
} catch(error) {console.log('Safe generation diagnosis: '+(error.reason??'unknown')+' / '+error.constructor.name); process.exitCode=1;}

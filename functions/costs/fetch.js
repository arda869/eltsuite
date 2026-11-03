import {costContext} from './context.js';
import {beginAttempt,settleAttempt} from './ledger.js';
export async function trackedFetch(url,options={},fetchImpl=globalThis.fetch) {
 const u=new URL(url),method=options.method??'GET';
 const openai=u.hostname==='api.openai.com'&&/^\/v1\/(responses$|images\/(generations|edits)$|audio\/transcriptions$)/.test(u.pathname);
 const google=u.hostname==='generativelanguage.googleapis.com'&&u.pathname==='/v1beta/interactions';
 const runway=u.hostname==='api.dev.runwayml.com'&&/\/v1\/(text_to_video|image_to_video)$/.test(u.pathname);
 if(method!=='POST'||!openai&&!google&&!runway)return fetchImpl(url,options);
 let request={};try{request=typeof options.body==='string'?JSON.parse(options.body):Object.fromEntries(['model'].map(k=>[k,options.body?.get?.(k)]));}catch{}
 const provider=openai?'openai':google?'google':'runway',model=request.model??'unknown';
 const attempt=await beginAttempt({provider,model,ceilingMicroUsd:runway?Math.ceil(request.duration*120000):google?80000:5000000});
 try {
  const response=await fetchImpl(url,options);
  // Parse once before application validation: invalid output can still be billable.
  // Reuse the parsed body to avoid duplicating large base64 images in memory.
  const body=await response.json().catch(()=>({}));
  response.json=async()=>body;
  if(attempt&&typeof body.model==='string'&&body.model!==model){attempt.model=body.model;await attempt.ref.update({model:body.model});}
  const {normaliseUsage}=await import('./pricing.js');
  let usage=normaliseUsage(attempt?.model??model,body),basis='provider_usage';
  if(model.startsWith('gpt-image-')&&Array.isArray(body.data))usage.images=body.data.length;
  if(google&&response.ok&&(body.steps??[]).some(s=>(s.content??[]).some(c=>c.type==='audio'&&typeof c.data==='string'&&c.data.length))){usage={songs:1};basis='calculated_units';}
  if(runway&&response.ok){usage={videoSeconds:request.duration};basis='estimated_usage';}
  if(model==='gpt-4o-transcribe-diarize'&&!Object.keys(usage).length&&Number.isFinite(body.duration)){usage={audioSeconds:body.duration};basis='estimated_usage';}
  await settleAttempt(attempt,{usage,basis,status:response.ok?(runway?'pending':'success'):'failed',providerRequestId:body.id??response.headers?.get?.('x-request-id'),failureCode:response.ok?null:'http_'+response.status});
  if(runway&&response.ok&&attempt){costContext.getStore().deferred.add(attempt.generationId);Object.defineProperty(response,'costAttemptId',{value:attempt.id});}
  return response;
 } catch(e){await settleAttempt(attempt,{status:'failed',failureCode:'connection_or_accounting'}).catch(()=>console.error('ai_cost_settlement_failed'));throw e;}
}

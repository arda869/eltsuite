import {onCall as firebaseOnCall} from 'firebase-functions/v2/https';
import {costContext,newContext} from './context.js';
import {finishContext} from './ledger.js';
export async function withCosts(metadata,work) {
 const c=newContext(metadata);
 return costContext.run(c,async()=>{
  try {const result=await work();await finishContext(c,'success');return result;}
  catch(e){await finishContext(c,'failed').catch(()=>console.error('ai_cost_finalisation_failed'));throw e;}
 });
}
export function onCall(options,handler) {
 return firebaseOnCall(options,req=>withCosts({uid:req.auth?.uid,classId:req.data?.classId,operationId: typeof req.data?.requestId==='string' && /^[\w-]{1,128}$/.test(req.data.requestId) ? `${req.auth?.uid}:${req.rawRequest?.path??'call'}:${req.data.requestId}` : undefined},()=>handler(req)));
}

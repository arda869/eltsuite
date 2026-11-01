import {MAX_INPUT_TOKENS} from './budget.js';
import {GenerationError,httpFailure} from './errors.js';
// Official Responses input-token count includes instructions and output schema.
// https://developers.openai.com/api/docs/guides/token-counting
export async function countWithinBudget(body,{apiKey,fetchImpl=fetch,timeoutMs=20000}) {
 const {model,input,instructions,reasoning,text}=body;
 let response;
 try{response=await fetchImpl('https://api.openai.com/v1/responses/input_tokens',{method:'POST',signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,input,instructions,reasoning,text,truncation:'disabled'})});}
 catch(e){throw new GenerationError(['TimeoutError','AbortError'].includes(e?.name)?'timeout':'connection');}
 let data;try{data=await response.json();}catch{throw new GenerationError('provider');}
 if(!response.ok)throw httpFailure(response.status,data?.error?.code);
 if(data?.object!=='response.input_tokens'||!Number.isSafeInteger(data.input_tokens)||data.input_tokens<0)throw new GenerationError('provider');
 // Keep headroom without changing the reservation or usage-accounting limits.
 if(data.input_tokens>MAX_INPUT_TOKENS-1000)throw new GenerationError('input_limit');
 return data.input_tokens;
}

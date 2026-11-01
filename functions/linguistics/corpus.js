// Adapter based on the provider's OpenAPI specification, checked 2 November 2026:
// https://www.sketchengine.eu/apidoc/openapi.yaml
import {HttpsError} from 'firebase-functions/v2/https';
const endpoint='https://api.sketchengine.eu/search/';
const literal=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function corpusConfiguration(raw,connected){
 const corpora=Array.isArray(raw?.corpora)?raw.corpora.filter(c=>typeof c.id==='string'&&/^[\w/.-]{1,160}$/.test(c.id)&&c.licensed===true&&typeof c.attribution==='string'&&typeof c.licence==='string').slice(0,20):[];
 return {available:connected&&raw?.enabled===true&&corpora.length>0,provider:'Sketch Engine',corpora:corpora.map(c=>({id:c.id,name:String(c.name||c.id),attribution:c.attribution,licence:c.licence,allowCache:c.allowCache===true,allowExport:c.allowExport===true,allowAI:c.allowAI===true,lemma:c.lemma===true})),reason:'Corpus search needs a bound Sketch Engine API key and an approved corpus licence. Teacher-supplied evidence is available now.'};
}
export async function searchCorpus({config,apiKey,query,corpusId,page=1,caseSensitive=false,lemma=false,fetchImpl=fetch}){
 const corpus=config.corpora.find(c=>c.id===corpusId);if(!config.available||!apiKey||!corpus)throw new HttpsError('failed-precondition',config.reason);
 if(typeof query!=='string'||!query.trim()||query.length>200||!Number.isInteger(page)||page<1||page>50)throw new HttpsError('invalid-argument','Enter a word or phrase of up to 200 characters.');
 if(lemma&&!corpus.lemma)throw new HttpsError('failed-precondition','Lemma search is not enabled for this corpus.');
 const queryPart=lemma?{queryselector:'lemmarow',lemma:literal(query.trim()),qmcase:caseSensitive}:{queryselector:'phraserow',phrase:literal(query.trim()),qmcase:caseSensitive};
 const url=new URL(endpoint+'concordance');for(const [k,v] of Object.entries({corpname:corpus.id,format:'json',asyn:0,fromp:page,pagesize:20,kwicleftctx:'40',kwicrightctx:'40',json:JSON.stringify({concordance_query:[queryPart]})}))url.searchParams.set(k,String(v));
 const response=await fetchImpl(url,{headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'},signal:AbortSignal.timeout(30000)});
 if(response.status===401||response.status===403)throw new HttpsError('failed-precondition','The corpus connection could not authenticate or this corpus is not included. Ask the administrator to check the deployed binding and corpus entitlement.');
 if(!response.ok)throw new HttpsError('unavailable','The corpus provider is unavailable. Your investigation is unchanged.');
 const result=await response.json();if(result.error||!Array.isArray(result.Lines))throw new HttpsError('unavailable','The provider did not return usable concordance lines.');
 const words=parts=>(Array.isArray(parts)?parts:[]).map(p=>typeof p.str==='string'?p.str:'').join('');
 return {provider:'Sketch Engine',corpus:corpus.name,page,hasMore:result.Lines.length===20,finished:result.finished===1,lines:result.Lines.slice(0,20).map((line,i)=>({id:`ske-${Date.now()}-${page}-${i}`,before:words(line.Left),match:words(line.Kwic),after:words(line.Right),text:words(line.Left)+words(line.Kwic)+words(line.Right),origin:'source',source:corpus.attribution,url:'https://www.sketchengine.eu/',location:[corpus.id,...(line.Refs||[]).filter(v=>typeof v==='string')].join(' · ').slice(0,500),licence:corpus.licence,shareAllowed:corpus.allowExport,consent:false,date:new Date().toISOString().slice(0,10),context:'Retrieved concordance context; not necessarily a complete sentence.',canSave:corpus.allowCache,providerRef:{provider:'sketchengine',corpusId:corpus.id,toknum:Number(line.toknum)||0}}))};
}

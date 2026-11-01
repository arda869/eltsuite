// Public v1 API: https://api.tatoeba.org/openapi.json (checked 2026-11-02).
import {HttpsError} from 'firebase-functions/v2/https';
export const tatoebaCorpus={id:'tatoeba-eng',name:'Tatoeba · English example sentences',lemma:false};
export const licences={'CC BY 2.0 FR':'https://creativecommons.org/licenses/by/2.0/fr/','CC0 1.0':'https://creativecommons.org/publicdomain/zero/1.0/'};
export async function searchTatoeba({query,cursor='',caseSensitive=false,fetchImpl=fetch}){
 if(typeof query!=='string'||!query.trim()||query.length>200||typeof cursor!=='string'||cursor.length>500)throw new HttpsError('invalid-argument','Enter a word or phrase of up to 200 characters.');
 const phrase=query.trim();
 const url=new URL('https://api.tatoeba.org/v1/sentences');
 const escaped=phrase.replace(/[\\"()|!@~&/^$=<\-]/g,'\\$&');
 for(const [key,value] of Object.entries({lang:'eng',q:'"'+escaped+'"',sort:'relevance',limit:'20',is_unapproved:'no',is_orphan:'no',showtrans:'none',license:'CC BY 2.0 FR,CC0 1.0'}))url.searchParams.set(key,value);
 if(cursor)url.searchParams.set('after',cursor);
 let response;try{response=await fetchImpl(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});}catch{throw new HttpsError('unavailable','Tatoeba could not be reached. Your saved evidence is unchanged. Try again shortly.');}
 if(!response.ok)throw new HttpsError('unavailable',response.status===429?'Tatoeba is busy. Please wait before searching again.':'Tatoeba search is temporarily unavailable. Your saved evidence is unchanged.');
 const result=await response.json();if(!Array.isArray(result.data))throw new HttpsError('unavailable','Tatoeba did not return usable sentence examples.');
 let nextCursor='';try{const next=new URL(result.paging?.next);if(next.origin===url.origin&&next.pathname===url.pathname)nextCursor=next.searchParams.get('after')||'';}catch{}
 const lines=result.data.slice(0,20).filter(s=>Number.isSafeInteger(s.id)&&s.id>0&&s.lang==='eng'&&typeof s.text==='string'&&s.text.length<=6000&&s.is_unapproved===false&&typeof s.owner==='string'&&s.owner&&Object.hasOwn(licences,s.license)).flatMap(s=>{
 const at=(caseSensitive?s.text:s.text.toLowerCase()).indexOf(caseSensitive?phrase:phrase.toLowerCase());if(at<0)return [];
 return [{id:'tatoeba-'+s.id,text:s.text,before:s.text.slice(0,at),match:s.text.slice(at,at+phrase.length),after:s.text.slice(at+phrase.length),origin:'source',source:`Tatoeba contributor ${s.owner}`,url:`https://tatoeba.org/en/sentences/show/${s.id}`,location:`Sentence ${s.id}`,licence:`${s.license} · ${licences[s.license]}`,shareAllowed:true,consent:false,date:new Date().toISOString().slice(0,10),context:'Community-contributed example sentence; review suitability for your learners. Not a balanced corpus or a record of natural conversation.',canSave:true,providerRef:{provider:'tatoeba',sentenceId:s.id}}];
 });
 return {provider:'Tatoeba',corpus:tatoebaCorpus.name,lines,hasMore:result.paging?.has_next===true&&!!nextCursor,nextCursor};
}

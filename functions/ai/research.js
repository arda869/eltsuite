import { GenerationError } from './errors.js';
const short={type:'string',minLength:1,maxLength:180};
export const researchSchema={type:'object',additionalProperties:false,required:['queries'],properties:{queries:{type:'array',minItems:2,maxItems:3,items:short}}};
export const sourceSchema={type:'array',minItems:0,maxItems:3,items:{type:'object',additionalProperties:false,required:['title','url','extract'],properties:{title:short,url:{type:'string',minLength:1,maxLength:500},extract:{type:'string',minLength:1,maxLength:7000}}}};
const userAgent='ELTSuiteLessonResearch/1.0 (https://eltsuite.com; educational materials)';
export async function wikiRequest(host,params,fetchImpl=fetch) {
 if(!['en.wikipedia.org','commons.wikimedia.org'].includes(host))throw Error('Unsupported research host.');
 const url=new URL(`https://${host}/w/api.php`);
 for(const [k,v] of Object.entries({action:'query',format:'json',formatversion:'2',...params}))url.searchParams.set(k,String(v));
 const r=await fetchImpl(url,{headers:{'User-Agent':userAgent},redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw new GenerationError('research');
 const text=await r.text();if(text.length>250000)throw new GenerationError('research');
 const data=JSON.parse(text);if(data.error)throw new GenerationError('research');return data;
}
export async function collectSources(queries,fetchImpl=fetch) {
 const found=await Promise.allSettled(queries.slice(0,3).map(q=>wikiRequest('en.wikipedia.org',{list:'search',srsearch:q,srlimit:1,srnamespace:0},fetchImpl)));
 const ids=[...new Set(found.flatMap(r=>r.status==='fulfilled'?(r.value.query?.search??[]).map(p=>p.pageid):[]))].slice(0,3);
 const results=await Promise.allSettled(ids.map(pageid=>wikiRequest('en.wikipedia.org',{pageids:pageid,prop:'extracts|info',inprop:'url',explaintext:1,exlimit:1},fetchImpl)));
 const sources=results.flatMap(r=>r.status==='fulfilled'?(r.value.query?.pages??[]):[]).filter(p=>p.extract?.length>100&&p.fullurl?.startsWith('https://en.wikipedia.org/wiki/')).map(p=>({title:p.title,url:p.fullurl,extract:relevantExtract(p.extract,queries)}));
 if(!sources.length)throw new GenerationError('research');
 return sources;
}

export function relevantExtract(text,queries) {
 const terms=[...new Set(queries.join(' ').toLowerCase().match(/[a-z]{4,}/g)??[])];
 const paragraphs=[];let heading='';
 for(const line of text.split('\n')) {
  if(/^=+/.test(line.trim())){heading=line.replace(/=/g,'').trim();continue;}
  if(line.trim().length>80)paragraphs.push({text:line.trim(),heading});
 }
 if(!paragraphs.length)return text.slice(0,3500);
 // Rare query terms and section headings carry more weight than a person's name
 // repeated throughout an article. This retrieves the routine, not just a biography.
 const frequency=t=>paragraphs.filter(p=>(p.heading+' '+p.text).toLowerCase().includes(t)).length||1;
 const score=p=>terms.reduce((n,t)=>n+((p.heading+' '+p.text).toLowerCase().includes(t)?1/frequency(t):0)+(p.heading.toLowerCase().includes(t)?2/frequency(t):0),0);
 const selected=[paragraphs[0].text.slice(0,900)];let size=selected[0].length;
 const ranked=paragraphs.slice(1).map((p,i)=>({...p,i,score:score(p)})).sort((a,b)=>b.score-a.score||a.i-b.i);
 for(const p of ranked){const excerpt=(p.heading?p.heading+'\n':'')+p.text;if(size+excerpt.length>3400)continue;selected.push(excerpt);size+=excerpt.length+2;if(size>3000)break;}
 return selected.join('\n\n').slice(0,3500);
}

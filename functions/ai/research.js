import { GenerationError } from './errors.js';
const short={type:'string',minLength:1,maxLength:180};
const lead={type:'object',additionalProperties:false,required:['title','focus'],properties:{title:short,focus:short}};
export const researchSchema={type:'object',additionalProperties:false,required:['queries'],properties:{queries:{type:'array',minItems:2,maxItems:3,items:lead}}};
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
 const results=await Promise.allSettled(queries.slice(0,3).map(async query=>{
  const title=typeof query==='string'?query:query.title;
  let data=await wikiRequest('en.wikipedia.org',{titles:title,redirects:1,prop:'extracts|info',inprop:'url',explaintext:1,exlimit:1},fetchImpl);
  if(!(data.query?.pages??[]).some(p=>p.extract?.length>100)) {
   const search=await wikiRequest('en.wikipedia.org',{list:'search',srsearch:title,srlimit:1,srnamespace:0},fetchImpl);
   const id=search.query?.search?.[0]?.pageid;if(!id)return [];
   data=await wikiRequest('en.wikipedia.org',{pageids:id,prop:'extracts|info',inprop:'url',explaintext:1,exlimit:1},fetchImpl);
  }
  return (data.query?.pages??[]).filter(p=>p.extract?.length>100&&p.fullurl?.startsWith('https://en.wikipedia.org/wiki/')).map(p=>({title:p.title,url:p.fullurl,extract:relevantExtract(p.extract,[typeof query==='string'?query:query.focus])}));
 }));
 const sources=[...new Map(results.flatMap(r=>r.status==='fulfilled'?r.value:[]).map(p=>[p.url,p])).values()];
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
 if(!paragraphs.length)return text.slice(0,6000);
 // Rare query terms and section headings carry more weight than a person's name
 // repeated throughout an article. This retrieves the routine, not just a biography.
 const frequency=t=>paragraphs.filter(p=>(p.heading+' '+p.text).toLowerCase().includes(t)).length||1;
 const score=p=>terms.reduce((n,t)=>n+((p.heading+' '+p.text).toLowerCase().includes(t)?1/frequency(t):0)+(p.heading.toLowerCase().includes(t)?2/frequency(t):0),0);
 const opening=[];let openingSize=0;for(const p of paragraphs){if(p.heading||openingSize+p.text.length>2200)break;opening.push(p.text);openingSize+=p.text.length+2;}
 const selected=opening.length?opening:[paragraphs[0].text.slice(0,1500)];let size=selected.join('\n\n').length;
 const ranked=paragraphs.filter(p=>!selected.includes(p.text)).map((p,i)=>({...p,i,score:score(p)})).sort((a,b)=>b.score-a.score||a.i-b.i);
 for(const p of ranked){const excerpt=(p.heading?p.heading+'\n':'')+p.text;if(size+excerpt.length>5900)continue;selected.push(excerpt);size+=excerpt.length+2;if(size>5500)break;}
 return selected.join('\n\n').slice(0,6000);
}

const sourceReviewSchema={type:'object',additionalProperties:false,required:['usableIndices','reason','queries'],properties:{usableIndices:{type:'array',maxItems:3,items:{type:'integer',minimum:0,maximum:2}},reason:{type:'string',maxLength:1200},queries:researchSchema.properties.queries}};
export async function researchLesson(brief,{generate,reserve,fetchImpl=fetch}) {
 const usage=[];
 const call=async args=>{await reserve();const result=await generate({...args,timeoutMs:60000});usage.push(result.usage);return result.value;};
 let leads=await call({name:'research',schema:researchSchema,input:{brief},instructions:'Choose 2–3 exact English Wikipedia article titles about interesting real people, events, places or discoveries that can anchor this adult lesson. Do not use keyword bags or search sentences as titles. Supply a separate focus of distinctive section keywords needed for the lesson, e.g. title International Space Station with focus daily routine sleeping meals exercise working day. For a mystery, focus discovery voyage chronology evidence investigation explanations, not adaptations or popular culture. For routines choose documented distinctive lives, not generic profiles. Avoid private learner details. These are research leads, not verified facts.'});
 for(let attempt=0;attempt<2;attempt++) {
  let sources=[];try{sources=await collectSources(leads.queries,fetchImpl);}catch(error){if(error.reason!=='research')throw error;}
  const decision=await call({name:'research_review',schema:sourceReviewSchema,input:{brief,sources},instructions:'Judge the actual supplied extracts, not what you know about these subjects. Select zero-based usableIndices only for sources with concrete relevant evidence sufficient for an interesting original reading or listening that serves this brief. A routine lesson needs actual documented habits or daily work, not launch dates or a generic biography. A mystery needs its sequence and evidence, not merely commemorations or adaptations. Reject irrelevant or insufficient extracts. Return a specific reason and 2–3 alternative exact Wikipedia titles with focused section keywords if another search is needed. Never invent evidence. At least one good source is sufficient; do not select weak extras.'});
  const selected=[...new Set(decision.usableIndices)].map(i=>sources[i]).filter(Boolean);
  if(selected.length)return {sources:selected,usage};
  leads={queries:decision.queries};
 }
 throw new GenerationError('research');
}

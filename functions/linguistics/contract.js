// The shared evidence contract never treats a generated example as corpus evidence.
export const families = ['corpus','discourse','language-awareness','pragmatics','learner-development','research'];
export const idOf = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value) ? value : (()=>{throw Error('Choose a valid saved item.');})();
const text = (v,n=4000) => typeof v === 'string' ? v.trim().slice(0,n) : '';
export function investigationInput(raw) {
 if(!raw || !families.includes(raw.type)) throw Error('Choose an investigation type.');
 const title=text(raw.title,160); if(!title) throw Error('Give your investigation a title.');
 const fields=Object.fromEntries(Object.entries(raw.fields||{}).slice(0,30).filter(([k,v])=>/^[a-zA-Z][\w-]{0,40}$/.test(k)&&typeof v==='string').map(([k,v])=>[k,text(v,12000)]));
 const evidence=(Array.isArray(raw.evidence)?raw.evidence:[]).slice(0,80).map(e=>{
  const origin=['source','teacher','ai','learner'].includes(e.origin)?e.origin:'teacher';
  const row={id:idOf(e.id),text:text(e.text,6000),source:text(e.source,300),url:text(e.url,2000),location:text(e.location,100),licence:text(e.licence,500),origin,shareAllowed:e.shareAllowed===true,consent:e.consent===true,date:text(e.date,40),context:text(e.context,2000)};
  if(row.url&&!/^https?:\/\//i.test(row.url))throw Error('Source links must begin with https:// or http://.');
  if(origin==='source'&&(!row.source||!row.licence))throw Error('Sourced examples need attribution and reuse terms.');
  if(origin==='learner'&&!row.consent)throw Error('Confirm consent before saving learner evidence.');
  if(e.sourceRef)row.sourceRef={classId:idOf(e.sourceRef.classId),portfolioId:idOf(e.sourceRef.portfolioId)};
  if(e.providerRef){
   if(e.providerRef.provider!=='sketchengine'||! /^[\w/.-]{1,160}$/.test(e.providerRef.corpusId))throw Error('Invalid corpus provenance.');
   row.providerRef={provider:'sketchengine',corpusId:e.providerRef.corpusId,toknum:Number(e.providerRef.toknum)||0};
  }
  return row;
 });
 const annotations=(Array.isArray(raw.annotations)?raw.annotations:[]).slice(0,150).map(a=>({id:idOf(a.id),evidenceId:idOf(a.evidenceId),span:text(a.span,1000),tag:text(a.tag,80),note:text(a.note,2000),rater:text(a.rater,100),status:a.status==='confirmed'?'confirmed':'suggested',origin:a.origin==='ai'?'ai':'teacher',...(['low','medium','high'].includes(a.confidence)?{confidence:a.confidence}:{})}));
 for(const a of annotations)if(!evidence.some(e=>e.id===a.evidenceId&&e.text.includes(a.span)&&a.span))throw Error('Each annotation must identify an exact span in its evidence.');
 if(new Set(evidence.map(e=>e.id)).size!==evidence.length)throw Error('Evidence identifiers must be unique.');
 const result={schemaVersion:1,type:raw.type,title,fields,evidence,annotations};
 if(JSON.stringify(result).length>180000)throw Error('Split this investigation into smaller evidence collections.');
 return result;
}
export function selectedPacket(investigation, ids, {sharing=false}={}) {
 const chosen=new Set(Array.isArray(ids)?ids:[]), evidence=investigation.evidence.filter(e=>chosen.has(e.id));
 if(!evidence.length)throw Error('Select at least one evidence item.');
 if(evidence.length!==chosen.size)throw Error('Selected evidence has been removed. Review the selection again.');
 if(sharing&&evidence.some(e=>!e.shareAllowed||e.origin==='learner'))throw Error('Only examples approved for reuse can be shared. Keep learner records private; create a reviewed anonymised summary separately.');
 return {schemaVersion:1,type:investigation.type,title:investigation.title,evidence,annotations:investigation.annotations.filter(a=>chosen.has(a.evidenceId)&&a.status==='confirmed')};
}
export function concordance(evidence, query, caseSensitive=false) {
 const needle=caseSensitive?query:query.toLocaleLowerCase();if(!needle)return [];
 return evidence.flatMap(e=>{const hay=caseSensitive?e.text:e.text.toLocaleLowerCase(),out=[];let from=0,index;while((index=hay.indexOf(needle,from))>=0&&out.length<30){out.push({id:e.id,before:e.text.slice(Math.max(0,index-90),index),match:e.text.slice(index,index+query.length),after:e.text.slice(index+query.length,index+query.length+90)});from=index+Math.max(1,needle.length);}return out;});
}

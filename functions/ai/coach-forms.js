import * as Y from 'yjs';
import {getDatabase} from 'firebase-admin/database';
import {HttpsError} from 'firebase-functions/v2/https';
import {relevantWriting} from './coach-context.js';
const names={reflection:'Reflective journal page',plan:'Lesson plan',reading:'Professional reading',observation:'Observation form',research:'Research inquiry',corpus:'Corpus search',discourse:'Spoken discourse',language:'Language analysis'};
const kinds=new Set(['reflection','plan','reading','observation','research','corpus','discourse','language']);
export function documentFromState(value){
 const d=new Y.Doc();try{
  const updates=[value?.snap?.s,...Object.values(value?.u||{}).map(u=>u?.u)].filter(v=>typeof v==='string');
  if(updates.reduce((n,s)=>n+s.length,0)>12_000_000)throw Error('This document is too large to read as coaching context. Move the form into a smaller document.');
  for(const u of updates)Y.applyUpdate(d,Buffer.from(u,'base64'));
  const out=[],lines=[];function visit(n){if(n instanceof Y.XmlText)lines.push(n.toDelta().map(part=>typeof part.insert==='string'?part.insert:'').join(''));if(n instanceof Y.XmlElement){if(n.nodeName==='studioForm'){const a=n.getAttributes();if(kinds.has(a.kind)&&/^[\w-]{1,100}$/.test(a.id||'')){const fields=Object.fromEntries(Object.entries(a.fields||{}).filter(([k,v])=>/^[\w-]{1,60}$/.test(k)&&typeof v==='string').map(([k,v])=>[k,v.slice(0,1800)]));const ref=a.kind==='reading'&&a.reference&&typeof a.reference==='object'?a.reference:null;const source=ref?{title:String(ref.title||'').slice(0,300),authors:Array.isArray(ref.authors)?ref.authors.slice(0,8).map(p=>({first:String(p.first||'').slice(0,100),last:String(p.last||'').slice(0,100)})):[],year:String(ref.year||'').slice(0,20),journal:String(ref.journal||'').slice(0,200),publisher:String(ref.publisher||'').slice(0,200),doi:String(ref.doi||'').slice(0,200),url:String(ref.url||'').slice(0,400)}:null;out.push({id:a.id,kind:a.kind,title:String(a.title||names[a.kind]).slice(0,160),fields,...(source?{reference:source}:{}),examples:Array.isArray(a.examples)?a.examples.slice(0,12).map(e=>({text:String(e.text||'').slice(0,1000),source:String(e.source||'').slice(0,200),licence:String(e.licence||'').slice(0,200)})):[]});}}}if(n.toArray)for(const c of n.toArray())visit(c);}visit(d.getXmlFragment('default'));return {forms:out,text:lines.join('\n').slice(0,60000)};
  }finally{d.destroy();}
}
export const formsFromState=value=>documentFromState(value).forms;
function searchCard(source){
 const formText=source.forms.flatMap(f=>[f.title,...Object.values(f.fields),f.reference?.title].filter(v=>typeof v==='string')).join(' · ');
 return {version:1,preview:source.text.replace(/\s+/g,' ').slice(0,1800),forms:formText.replace(/\s+/g,' ').slice(0,4200)};
}
const terms=prompt=>[...new Set(String(prompt).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])].filter(w=>!['the','and','for','this','that','with','what','how','can','lesson','please','help','teach','teaching','would','could','should','about','have','from','your'].includes(w));
export function documentCandidateScore(prompt,file){
 const title=String(file.title||'').toLowerCase(),preview=String(file.coachIndex?.preview||'').toLowerCase(),forms=String(file.coachIndex?.forms||'').toLowerCase();
 return terms(prompt).reduce((n,w)=>n+(title.includes(w)?12:0)+(forms.includes(w)?4:0)+(preview.includes(w)?1:0),0);
}
export function relevantDocumentExcerpt(text,prompt,limit=3200){
 const paragraphs=String(text).split(/\n+/).map(s=>s.trim()).filter(Boolean);
 const query=terms(prompt);
 if(!paragraphs.length)return '';
 if(!query.length)return paragraphs.join('\n').slice(0,limit);
 const scored=paragraphs.map((value,index)=>({value,index,score:query.reduce((n,w)=>n+(value.toLowerCase().includes(w)?1:0),0)}));
 const chosen=[...new Set([0,...scored.filter(p=>p.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,8).map(p=>p.index)])].sort((a,b)=>a-b);
 return chosen.map(i=>paragraphs[i].slice(0,600)).join('\n').slice(0,limit);
}
export function formAccess(value,uid){return !!value&&value.kind==='doc'&&!value.deletedAt&&!value.purgeRequestedAt&&!value.purgingAt&&(value.owner===uid||(Array.isArray(value.memberIds)&&value.memberIds.includes(uid)));}
export async function loadStudioForms(db,uid,prompt,selected=null,{read=async key=>(await getDatabase().ref('collab/'+key.replace(/[.#$[\]]/g,'_')).get()).val()}={}){
 const selectedLookup=selected?db.doc('sharedDocs/'+selected.docId).get():null;
 const catalogLookup=typeof db.collection==='function'?Promise.all([db.collection('sharedDocs').where('owner','==',uid).get(),db.collection('sharedDocs').where('memberIds','array-contains',uid).get()]):null;
 const [selectedSnap,catalog]=await Promise.all([selectedLookup,catalogLookup]);
 if(selected&&!formAccess(selectedSnap.data(),uid))throw new HttpsError('permission-denied','This document is no longer available to you. Remove the selected form to continue.');
 const files=[...new Map([...(catalog||[]).flatMap(group=>group.docs),...(selectedSnap?[selectedSnap]:[])].map(s=>[s.id,{id:s.id,...s.data()}])).values()].filter(s=>formAccess(s,uid));
 const indexed=files.filter(f=>f.coachIndex?.version===1),unindexed=files.filter(f=>f.coachIndex?.version!==1);
 const ranked=indexed.sort((a,b)=>documentCandidateScore(prompt,b)-documentCandidateScore(prompt,a)||(b.updatedAt?.toMillis?.()||0)-(a.updatedAt?.toMillis?.()||0));
 const candidates=[...new Map([...unindexed,...ranked.slice(0,12),...(selected?[files.find(f=>f.id===selected.docId)]:[])].filter(Boolean).map(f=>[f.id,f])).values()];
 let skipped=0;const rows=[],documents=[];
 for(let i=0;i<candidates.length;i+=8)await Promise.all(candidates.slice(i,i+8).map(async f=>{
  if(!f.docKey)return;
  let source;
  try{source=documentFromState(await read(f.docKey));}
  catch(e){if(selected?.docId===f.id)throw new HttpsError('unavailable','We couldn’t read this form from its current document. Reopen the document and try again.');skipped++;return;}
  if(!f.coachIndex)try{await db.doc('sharedDocs/'+f.id).update({coachIndex:searchCard(source)});}catch{}
  for(const form of source.forms)rows.push({...form,text:[form.reference?.title,...Object.values(form.fields)].filter(Boolean).join(' '),at:f.updatedAt?.toMillis?.()||0,docId:f.id,documentTitle:f.title||'Collab document'});
  if(source.text.trim().length>30)documents.push({id:f.id,title:f.title||'Collab document',text:relevantDocumentExcerpt(source.text,prompt),at:f.updatedAt?.toMillis?.()||0});
 }));
 const exact=selected?rows.find(r=>r.docId===selected.docId&&r.id===selected.formId):null;
 if(selected&&!exact)throw new HttpsError('not-found','This form was removed from its document. Choose another form or continue without it.');
 const related=relevantWriting(rows.filter(r=>!exact||r.docId!==exact.docId||r.id!==exact.id),prompt,selected?2:3);
 const chosen=exact?[exact,...related]:related;
 return {forms:chosen.map(({text,at,...r})=>r),documents:relevantWriting(documents,prompt,3).map(({at,...r})=>r),skipped,scope:`Considered titles and available previews for ${files.length} accessible Collab documents; attempted to open ${candidates.length} likely sources in detail.${unindexed.length?' Documents without a preview were read directly, with previews saved when possible.':''}${skipped?' Some documents were unavailable.':''}`};
}

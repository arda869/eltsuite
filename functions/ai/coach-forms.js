import * as Y from 'yjs';
import {getDatabase} from 'firebase-admin/database';
import {HttpsError} from 'firebase-functions/v2/https';
import {relevantWriting} from './coach-context.js';
const names={reflection:'Reflective journal page',plan:'Lesson plan',reading:'Professional reading',observation:'Observation form',research:'Research inquiry',corpus:'Corpus search',discourse:'Spoken discourse',language:'Language analysis'};
const kinds=new Set(['reflection','plan','reading','observation','research','corpus','discourse','language']);
export function formsFromState(value){
 const d=new Y.Doc();try{
  const updates=[value?.snap?.s,...Object.values(value?.u||{}).map(u=>u?.u)].filter(v=>typeof v==='string');
  if(updates.reduce((n,s)=>n+s.length,0)>12_000_000)throw Error('This document is too large to read as coaching context. Move the form into a smaller document.');
  for(const u of updates)Y.applyUpdate(d,Buffer.from(u,'base64'));
  const out=[];function visit(n){if(n instanceof Y.XmlElement){if(n.nodeName==='studioForm'){const a=n.getAttributes();if(kinds.has(a.kind)&&/^[\w-]{1,100}$/.test(a.id||'')){const fields=Object.fromEntries(Object.entries(a.fields||{}).filter(([k,v])=>/^[\w-]{1,60}$/.test(k)&&typeof v==='string').map(([k,v])=>[k,v.slice(0,1800)]));const ref=a.kind==='reading'&&a.reference&&typeof a.reference==='object'?a.reference:null;const source=ref?{title:String(ref.title||'').slice(0,300),authors:Array.isArray(ref.authors)?ref.authors.slice(0,8).map(p=>({first:String(p.first||'').slice(0,100),last:String(p.last||'').slice(0,100)})):[],year:String(ref.year||'').slice(0,20),journal:String(ref.journal||'').slice(0,200),publisher:String(ref.publisher||'').slice(0,200),doi:String(ref.doi||'').slice(0,200),url:String(ref.url||'').slice(0,400)}:null;out.push({id:a.id,kind:a.kind,title:String(a.title||names[a.kind]).slice(0,160),fields,...(source?{reference:source}:{}),examples:Array.isArray(a.examples)?a.examples.slice(0,12).map(e=>({text:String(e.text||'').slice(0,1000),source:String(e.source||'').slice(0,200),licence:String(e.licence||'').slice(0,200)})):[]});}}}if(n.toArray)for(const c of n.toArray())visit(c);}visit(d.getXmlFragment('default'));return out;
 }finally{d.destroy();}
}
export function formAccess(value,uid){return !!value&&value.kind==='doc'&&!value.deletedAt&&!value.purgeRequestedAt&&!value.purgingAt&&(value.owner===uid||(Array.isArray(value.memberIds)&&value.memberIds.includes(uid)));}
export async function loadStudioForms(db,uid,prompt,selected=null,{read=async key=>(await getDatabase().ref('collab/'+key.replace(/[.#$[\]]/g,'_')).get()).val()}={}){
 let files;
 if(selected){const s=await db.doc('sharedDocs/'+selected.docId).get();if(!formAccess(s.data(),uid))throw new HttpsError('permission-denied','This document is no longer available to you. Remove the selected form to continue.');files=[{id:s.id,...s.data()}];}
 else{const [own,shared]=await Promise.all([db.collection('sharedDocs').where('owner','==',uid).get(),db.collection('sharedDocs').where('memberIds','array-contains',uid).get()]);files=[...new Map([...own.docs,...shared.docs].map(s=>[s.id,{id:s.id,...s.data()}])).values()].filter(s=>formAccess(s,uid));}
 let skipped=0;const rows=[];for(let i=0;i<files.length;i+=4)await Promise.all(files.slice(i,i+4).map(async f=>{if(!f.docKey)return;try{const forms=formsFromState(await read(f.docKey));for(const form of forms)rows.push({...form,text:[form.reference?.title,...Object.values(form.fields)].filter(Boolean).join(' '),at:f.updatedAt?.toMillis?.()||0,docId:f.id,documentTitle:f.title||'Collab document'});}catch(e){if(selected)throw new HttpsError('unavailable','We couldn’t read this form from its current document. Reopen the document and try again.');skipped++;}}));
 const chosen=selected?rows.filter(r=>r.docId===selected.docId&&r.id===selected.formId):relevantWriting(rows,prompt,3);
 if(selected&&!chosen.length)throw new HttpsError('not-found','This form was removed from its document. Choose another form or continue without it.');
 return {forms:chosen.map(({text,at,...r})=>r),skipped};
}

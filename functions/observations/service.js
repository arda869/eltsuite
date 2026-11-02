import {HttpsError} from 'firebase-functions/v2/https';
import {createHash} from 'node:crypto';
import {actor,targetAccess} from '../linguistics/service.js';
import {idOf,observationInput,noteInput,selection,versionOf,sourcePacket} from './contract.js';
const denied=()=>{throw new HttpsError('permission-denied','This observation is private or no longer available.');};
const stale=()=>{throw new HttpsError('aborted','This record changed in another window. Your unsaved text is still here. Reopen the current record before saving.');};
async function owned(db,who,id){const ref=db.doc('classroomObservations/'+idOf(id)),s=await ref.get();if(!s.exists||s.get('owner')!==who.uid||s.get('deleted'))denied();return {ref,value:{...s.data(),id:s.id}};}
async function packet(db,who,id,selected){const {value}=await owned(db,who,id);const notes=await Promise.all(selection(selected).map(async nid=>{const s=await db.doc(`classroomObservations/${id}/notes/${nid}`).get();if(!s.exists)throw new HttpsError('not-found','A selected note was removed. Review your selection.');return {id:s.id,...s.data()};}));return sourcePacket(value,notes,selected);}
export async function handleObservation(db,auth,d={}){
 const who=await actor(db,auth);if(!who.teacher)denied();
 if(d.action==='list'){const rows=await db.collection('classroomObservations').where('owner','==',who.uid).limit(100).get();return {items:rows.docs.filter(s=>!s.get('deleted')).map(s=>({id:s.id,...s.data()})).sort((a,b)=>b.updatedAt-a.updatedAt)};}
 if(d.action==='create'){
  const value=observationInput(d.observation),id=idOf(d.id),ref=db.doc('classroomObservations/'+id);
  if(value.classId&&!await targetAccess(db,who,{type:'class',id:value.classId},true))denied();
  if(value.itemId&&!(await db.doc(`classes/${value.classId}/items/${value.itemId}`).get()).exists)throw new HttpsError('not-found','This lesson is no longer available.');
  const fingerprint=createHash('sha256').update(JSON.stringify(value)).digest('hex');
  await db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists){if(old.get('owner')!==who.uid)denied();if(old.get('createFingerprint')!==fingerprint||old.get('deleted'))stale();return;}const now=Date.now();tx.create(ref,{...value,owner:who.uid,createdAt:now,updatedAt:now,startedAt:now,endedAt:null,version:1,createFingerprint:fingerprint,deleted:false});});
  return {id};
 }
 if(d.action==='load'){const {value}=await owned(db,who,d.id);const notes=await db.collection(`classroomObservations/${d.id}/notes`).orderBy('offsetSeconds').limit(500).get();return {observation:value,notes:notes.docs.filter(s=>!s.get('deleted')).map(s=>({id:s.id,...s.data()}))};}
 if(d.action==='saveNote'){
  const value=noteInput(d.note),nid=idOf(d.noteId),version=versionOf(d.version),{ref}=await owned(db,who,d.id),note=ref.collection('notes').doc(nid);
  const fingerprint=createHash('sha256').update(JSON.stringify({value,version})).digest('hex');
  const saved=await db.runTransaction(async tx=>{const [o,n]=await Promise.all([tx.get(ref),tx.get(note)]);if(o.get('owner')!==who.uid||o.get('deleted'))denied();if(n.get('fingerprint')===fingerprint&&!n.get('deleted'))return n.get('version');if((n.get('version')||0)!==version||n.get('deleted'))stale();if(!n.exists&&(o.get('noteCount')||0)>=500)throw new HttpsError('resource-exhausted','This observation has reached 500 notes. Start a new observation to continue.');const now=Date.now();tx.set(note,{...value,author:who.uid,createdAt:n.get('createdAt')||now,updatedAt:now,version:version+1,fingerprint,deleted:false});tx.update(ref,{updatedAt:now,...(!n.exists?{noteCount:(o.get('noteCount')||0)+1}:{})});return version+1;});
  return {id:nid,version:saved};
 }
 if(d.action==='finish'){
  const {ref}=await owned(db,who,d.id);await db.runTransaction(async tx=>{const s=await tx.get(ref);if(s.get('owner')!==who.uid||s.get('deleted'))denied();if(!s.get('endedAt'))tx.update(ref,{endedAt:Date.now(),updatedAt:Date.now(),version:s.get('version')+1});});return {finished:true};
 }
 if(d.action==='deleteNote'){
  const {ref}=await owned(db,who,d.id),note=ref.collection('notes').doc(idOf(d.noteId));
  await db.runTransaction(async tx=>{const [o,n]=await Promise.all([tx.get(ref),tx.get(note)]);if(o.get('owner')!==who.uid||o.get('deleted'))denied();if(!n.exists||n.get('version')!==versionOf(d.version))stale();tx.update(note,{deleted:true,version:n.get('version')+1,updatedAt:Date.now()});});return {deleted:true};
 }
 if(d.action==='coachPacket')return observationCoachEvidence(db,who.uid,d.id);
 if(d.action==='prepareCoach'){
  if(d.confirmed!==true)throw new HttpsError('failed-precondition','Review the selected notes and confirm before sharing them with Coach.');
  const source=await packet(db,who,d.id,d.selected);
  if(source.notes.reduce((n,x)=>n+x.text.length,0)>18000)throw new HttpsError('invalid-argument','Choose fewer or shorter notes for this conversation (up to 18,000 characters).');
  const inquiryId=idOf(d.inquiryId),q=await db.doc(`teachingCoach/${who.uid}/inquiries/${inquiryId}`).get();if(!q.exists)denied();
  const prefs=await db.doc(`teachingCoach/${who.uid}/settings/context`).get();if(prefs.get('inquiries')===false)throw new HttpsError('failed-precondition','Research inquiry context is disabled in Coach settings.');
  const ref=db.doc('observationCoachPackets/obs_'+db.collection('observationCoachPackets').doc().id);
  await ref.set({owner:who.uid,observationId:d.id,inquiryId,selected:source.notes.map(n=>n.id),versions:Object.fromEntries(source.notes.map(n=>[n.id,n.version])),purpose:typeof d.purpose==='string'?d.purpose.slice(0,1000):'',expiresAt:Date.now()+3600000});return {id:ref.id};
 }
 if(d.action==='inquiries'){const rows=await db.collection(`teachingCoach/${who.uid}/inquiries`).limit(100).get();return {items:rows.docs.map(s=>({id:s.id,title:s.get('title')}))};}
 if(d.action==='attachInquiry'){
  const source=await packet(db,who,d.id,d.selected),inquiry=db.doc(`teachingCoach/${who.uid}/inquiries/${idOf(d.inquiryId)}`);
  const purpose=typeof d.purpose==='string'?d.purpose.trim().slice(0,1000):'';
  await db.runTransaction(async tx=>{const old=await tx.get(inquiry);if(!old.exists)denied();const links=old.get('observationLinks')||[];tx.update(inquiry,{observationLinks:[...links.filter(l=>l.observationId!==source.observationId),{observationId:source.observationId,selected:source.notes.map(n=>n.id),purpose,attachedAt:Date.now()}].slice(-30),version:(old.get('version')||0)+1});});return {attached:true};
 }
 if(d.action==='inquiryEvidence'){
  const s=await db.doc(`teachingCoach/${who.uid}/inquiries/${idOf(d.inquiryId)}`).get();if(!s.exists)denied();
  const evidence=[];for(const l of s.get('observationLinks')||[]){try{evidence.push({...await packet(db,who,l.observationId,l.selected),purpose:l.purpose});}catch{evidence.push({observationId:l.observationId,unavailable:true});}}
  return {inquiryId:s.id,title:s.get('title'),evidence,limitation:'Differences in task, attendance, duration and observation methods may explain changes. This comparison does not establish cause and effect.'};
 }
 if(d.action==='export')return {...await packet(db,who,d.id,d.selected),exportedAt:Date.now()};
 if(d.action==='delete'){const {ref}=await owned(db,who,d.id);await ref.update({deleted:true,updatedAt:Date.now()});await db.recursiveDelete(ref);const packets=await db.collection('observationCoachPackets').where('observationId','==',d.id).get();for(const p of packets.docs)await p.ref.delete();return {deleted:true};}
 throw new HttpsError('invalid-argument','Choose a supported observation action.');
}

export async function observationCoachEvidence(db,uid,id){
 const p=(await db.doc('observationCoachPackets/'+idOf(id)).get()).data();
 if(!p||p.owner!==uid||p.expiresAt<Date.now())denied();
 const who={uid},source=await packet(db,who,p.observationId,p.selected);
 if(source.notes.some(n=>p.versions[n.id]!==n.version))throw new HttpsError('failed-precondition','Selected notes changed. Review them again before discussing them.');
 if(!(await db.doc(`teachingCoach/${uid}/inquiries/${p.inquiryId}`).get()).exists)denied();
 return {inquiryId:p.inquiryId,purpose:p.purpose,packet:{schemaVersion:1,type:'research',title:source.title,fields:{focus:source.focus,context:source.context},annotations:[],evidence:source.notes.map(n=>({id:n.id,text:n.text,source:source.title,url:'/observations?id='+source.observationId,location:n.offsetSeconds+' seconds · '+n.kind,licence:'Private selected teacher evidence',origin:'teacher',shareAllowed:false,consent:true,date:new Date(source.startedAt).toISOString().slice(0,10),context:n.kind==='observed'?'Teacher-recorded observation, not independently verified.':'Teacher interpretation, not an observed fact.'}))}};
}

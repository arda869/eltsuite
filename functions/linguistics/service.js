import { HttpsError } from 'firebase-functions/v2/https';
import { idOf, investigationInput, selectedPacket } from './contract.js';
import {corpusConfiguration,searchCorpus} from './corpus.js';
const denied=()=>{throw new HttpsError('permission-denied','This evidence is private, has been revoked, or is no longer shared with you.');};
async function get(db,path){return (await db.doc(path).get()).data();}
export async function actor(db,auth){
 if(!auth||auth.token?.proxyBy)throw new HttpsError('unauthenticated','Sign in with your own account to use research evidence.');
 const [profile,account]=await Promise.all([get(db,'users/'+auth.uid),get(db,'accounts/'+auth.uid)]);
 if(!profile||account?.suspended)denied();
 return {uid:auth.uid,teacher:profile.role==='teacher'&&!String(auth.token?.email||'').endsWith('@learners.lesson-lit.firebaseapp.com'),profile};
}
export async function targetAccess(db,who,target,write=false){
 const id=idOf(target.id);let d;
 if(target.type==='class'){
  d=await get(db,'classes/'+id);if(!d)return false;
  const teaches=d.teacherId===who.uid||d.coTeachers?.[who.uid]?.role==='co';
  return write?who.teacher&&teaches:teaches||d.coTeachers?.[who.uid]?.role==='viewer'||!!await get(db,`classes/${id}/members/${who.uid}`);
 }
 if(target.type==='doc'){
  d=await get(db,'sharedDocs/'+id);if(!d||d.deletedAt||d.purgingAt||d.purgeRequestedAt)return false;
  return write?who.teacher&&(d.owner===who.uid||d.members?.[who.uid]?.role==='edit'):d.owner===who.uid||d.memberIds?.includes(who.uid);
 }
 if(target.type==='message'){
  d=await get(db,'chats/'+id);const key=who.teacher?who.uid:who.profile.learnerId;
  return !!d?.members?.includes(key)&&(!write||who.teacher);
 }
 return false;
}
async function owned(db,who,id){const d=await get(db,'linguisticsInvestigations/'+idOf(id));if(!who.teacher||!d||d.owner!==who.uid||d.revoked)denied();return d;}
async function audit(db,who,action,id){await db.collection('linguisticsAudit').add({actor:who.uid,action,subject:id,at:Date.now()});}
async function checkPortfolioEvidence(db,who,evidence){
 for(const e of evidence.filter(e=>e.sourceRef)){
  if(!await targetAccess(db,who,{type:'class',id:e.sourceRef.classId},true))denied();
  const source=await get(db,`classes/${e.sourceRef.classId}/portfolio/${e.sourceRef.portfolioId}`);
  if(!source||source.kind!=='piece'||!String(source.note||'').includes(e.text)||!e.consent||e.origin!=='learner')throw new HttpsError('failed-precondition','A selected portfolio sample changed, was removed or is no longer permitted. Return to the portfolio to review the evidence.');
 }
}
export async function checkCorpusEvidence(db,evidence,{sharing=false,ai=false}={}){
 const rows=evidence.filter(e=>e.providerRef);if(!rows.length)return;
 const config=corpusConfiguration(await get(db,'admin/corpus'),true);
 for(const e of rows){const corpus=config.corpora.find(c=>c.id===e.providerRef.corpusId);
  if(!config.available||!corpus?.allowCache)throw new HttpsError('failed-precondition','The licence for selected corpus evidence no longer permits storing it. Remove that evidence or ask the administrator to review the licence.');
  if(sharing&&!corpus.allowExport)throw new HttpsError('failed-precondition','The corpus licence does not permit sharing these examples.');
  if(ai&&!corpus.allowAI)throw new HttpsError('failed-precondition','The corpus licence has not been approved for AI processing. Choose other evidence.');
  e.shareAllowed=e.shareAllowed&&corpus.allowExport;e.source=corpus.attribution;e.licence=corpus.licence;
 }
}
export async function coachEvidence(db,uid,id){
 const p=await get(db,'linguisticsCoachPackets/'+idOf(id));if(!p||p.owner!==uid||p.expiresAt<Date.now())denied();
 const source=await get(db,'linguisticsInvestigations/'+p.investigationId);if(!source||source.revoked||source.owner!==uid||source.version!==p.sourceVersion)throw new HttpsError('failed-precondition','The selected evidence changed or was revoked. Review it again before discussing it.');
 if(!await get(db,`teachingCoach/${uid}/inquiries/${p.inquiryId}`))denied();
 const packet=selectedPacket(source,p.selected);await checkCorpusEvidence(db,packet.evidence,{ai:true});if(packet.evidence.some(e=>e.origin==='learner'))denied();
 return {packet,inquiryId:p.inquiryId,purpose:p.purpose};
}
export async function resolveEmbed(db,who,id){
 const e=await get(db,'linguisticsEmbeds/'+idOf(id));if(!e||e.revoked||!await targetAccess(db,who,e.target))denied();
 const source=await get(db,'linguisticsInvestigations/'+e.investigationId);if(!source||source.revoked)denied();
 // Rights and withdrawn evidence take precedence even over an archival snapshot.
 await checkCorpusEvidence(db,selectedPacket(source,e.selected,{sharing:true}).evidence,{sharing:true});
 if(e.mode==='snapshot')await checkCorpusEvidence(db,e.snapshot.evidence,{sharing:true});
 const data=e.mode==='snapshot'?e.snapshot:{...selectedPacket(source,e.selected,{sharing:true}),fields:e.includeAnalysis?source.fields:{}};
 return {id,...e,title:data.title,snapshot:undefined,data};
}
export async function handleLinguistics(db,auth,input,provider={}){
 const who=await actor(db,auth),d=input||{},action=d.action;
 if(action==='openEmbed') {const e=await resolveEmbed(db,who,d.id);const {snapshot,...safe}=e;return safe;}
 if(action==='respond'){
  const e=await resolveEmbed(db,who,d.id);if(!e.responses)throw new HttpsError('failed-precondition','Responses are not enabled for this investigation.');
  const value=typeof d.value==='string'?d.value.trim():'';if(!value||value.length>6000)throw new HttpsError('invalid-argument','Write a response of up to 6,000 characters.');
  await db.doc(`linguisticsEmbeds/${e.id}/responses/${who.uid}`).set({value,by:who.uid,at:Date.now()});return {saved:true};
 }
 if(action==='myResponse'){await resolveEmbed(db,who,d.id);return {response:await get(db,`linguisticsEmbeds/${idOf(d.id)}/responses/${who.uid}`)||null};}
 if(!who.teacher)denied();
 if(action==='status')return {corpus:corpusConfiguration(await get(db,'admin/corpus'),!!provider.apiKey)};
 if(action==='corpusSearch'){
  const config=corpusConfiguration(await get(db,'admin/corpus'),!!provider.apiKey);if(!config.available)throw new HttpsError('failed-precondition',config.reason);
  const ref=db.doc(`linguisticsUsage/${who.uid}/days/${new Date().toISOString().slice(0,10)}`);await db.runTransaction(async tx=>{const old=await tx.get(ref);if((old.get('queries')||0)>=40)throw new HttpsError('resource-exhausted','You have used today’s 40 corpus queries. Try again tomorrow.');tx.set(ref,{queries:(old.get('queries')||0)+1});});
  return searchCorpus({config,apiKey:provider.apiKey,query:d.query,corpusId:d.corpusId,page:d.page,caseSensitive:d.caseSensitive===true,lemma:d.lemma===true});
 }
 if(action==='list'){const rows=await db.collection('linguisticsInvestigations').where('owner','==',who.uid).limit(100).get();return {items:rows.docs.filter(x=>!x.get('revoked')).map(x=>({id:x.id,title:x.get('title'),type:x.get('type'),updatedAt:x.get('updatedAt')})).sort((a,b)=>b.updatedAt-a.updatedAt)};}
 if(action==='load'){const source=await owned(db,who,d.id);await checkPortfolioEvidence(db,who,source.evidence);await checkCorpusEvidence(db,source.evidence);return {investigation:{...source,id:d.id}};}
 if(action==='save'){
  const value=investigationInput(d.investigation),id=d.id?idOf(d.id):db.collection('linguisticsInvestigations').doc().id,ref=db.doc('linguisticsInvestigations/'+id);
  await checkPortfolioEvidence(db,who,value.evidence);await checkCorpusEvidence(db,value.evidence);
  await db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists&&(old.get('owner')!==who.uid||old.get('revoked')))denied();if((old.get('version')||0)!==(d.version||0))throw new HttpsError('aborted','This investigation changed in another window. Reopen it before saving.');tx.set(ref,{...value,owner:who.uid,version:(d.version||0)+1,createdAt:old.get('createdAt')||Date.now(),updatedAt:Date.now(),revoked:false});});return {id,version:(d.version||0)+1};
 }
 if(action==='duplicate'){const source=await owned(db,who,d.id),ref=db.collection('linguisticsInvestigations').doc();await ref.set({...investigationInput(source),title:('Copy of '+source.title).slice(0,160),owner:who.uid,version:1,createdAt:Date.now(),updatedAt:Date.now(),revoked:false});return {id:ref.id};}
 if(action==='importPortfolio'){
  const classId=idOf(d.classId);if(d.confirmed!==true||!await targetAccess(db,who,{type:'class',id:classId},true))denied();
  const ids=[...new Set(Array.isArray(d.selected)?d.selected:[])].slice(0,10);if(!ids.length)throw new HttpsError('invalid-argument','Select one or more samples.');
  const evidence=[];for(const pid of ids){const p=await get(db,`classes/${classId}/portfolio/${idOf(pid)}`);if(!p||p.kind!=='piece'||!p.note)denied();evidence.push({id:idOf(pid),text:String(p.note).slice(0,6000),source:'Selected portfolio sample',url:'',location:'',licence:'Private consented teaching evidence',origin:'learner',shareAllowed:false,consent:true,date:new Date(p.at||Date.now()).toISOString().slice(0,10),context:String(p.skill||'')+' · '+String(p.title||''),sourceRef:{classId,portfolioId:pid}});}
  const ref=db.collection('linguisticsInvestigations').doc();await ref.set({schemaVersion:1,type:'learner-development',title:'Selected learner samples',fields:{},evidence,annotations:[],owner:who.uid,version:1,createdAt:Date.now(),updatedAt:Date.now(),revoked:false});await audit(db,who,'import-portfolio',ref.id);return {id:ref.id};
 }
 if(action==='revoke'){await owned(db,who,d.id);await db.doc('linguisticsInvestigations/'+d.id).update({revoked:true,updatedAt:Date.now()});await audit(db,who,'revoke',d.id);return {revoked:true};}
 if(action==='delete'){
  const source=await get(db,'linguisticsInvestigations/'+idOf(d.id));if(source?.owner!==who.uid)denied();
  await db.doc('linguisticsInvestigations/'+d.id).delete();
  for(const collectionName of ['linguisticsEmbeds','linguisticsCoachPackets']){const rows=await db.collection(collectionName).where('investigationId','==',d.id).get();for(const row of rows.docs)await db.recursiveDelete(row.ref);}
  const jobs=await db.collection(`aiPrivate/${who.uid}/jobs`).where('investigationId','==',d.id).get();for(const job of jobs.docs)await db.recursiveDelete(job.ref);
  await audit(db,who,'delete',d.id);return {deleted:true};
 }
 if(action==='export'){
  const source=await owned(db,who,d.id);if(d.version!==source.version)throw new HttpsError('failed-precondition','The source changed. Review it before exporting.');
  const packet=selectedPacket(source,d.selected,{sharing:true});await checkCorpusEvidence(db,packet.evidence,{sharing:true});await audit(db,who,'export',d.id);return {...packet,sourceId:d.id,sourceVersion:source.version,exportedAt:Date.now()};
 }
 if(action==='share'){
  const source=await owned(db,who,d.id);if(d.version!==undefined&&d.version!==source.version)throw new HttpsError('failed-precondition','The source changed. Review the current version before sharing.');if(!await targetAccess(db,who,d.target,true))denied();
  const packet={...selectedPacket(source,d.selected,{sharing:true}),fields:d.includeAnalysis===true?source.fields:{}},ref=db.collection('linguisticsEmbeds').doc();
  await checkCorpusEvidence(db,packet.evidence,{sharing:true});
  const embed={schemaVersion:1,includeAnalysis:d.includeAnalysis===true,investigationId:d.id,owner:who.uid,target:{type:d.target.type,id:idOf(d.target.id)},selected:packet.evidence.map(e=>e.id),mode:d.mode==='reference'?'reference':'snapshot',title:source.title,prompt:String(d.prompt||'What do you notice? Support your interpretation with examples.').slice(0,2000),responses:d.responses===true,revoked:false,createdAt:Date.now(),...(d.mode==='reference'?{}:{snapshot:packet})};
  await ref.set(embed);await audit(db,who,'share:'+d.target.type,ref.id);return {id:ref.id};
 }
 if(action==='responses'){const e=await resolveEmbed(db,who,d.id);if(e.owner!==who.uid)denied();const s=await db.collection(`linguisticsEmbeds/${e.id}/responses`).limit(200).get();return {responses:await Promise.all(s.docs.map(async x=>({id:x.id,name:(await get(db,'users/'+x.id))?.displayName||'Participant',...x.data()})))};}
 if(action==='revokeEmbed'){const e=await get(db,'linguisticsEmbeds/'+idOf(d.id));if(e?.owner!==who.uid)denied();await db.doc('linguisticsEmbeds/'+d.id).update({revoked:true});await audit(db,who,'revoke-embed',d.id);return {revoked:true};}
 if(action==='inquiries'){const rows=await db.collection(`teachingCoach/${who.uid}/inquiries`).limit(100).get();return {items:rows.docs.map(x=>({id:x.id,title:x.get('title')}))};}
 if(action==='coachPacket')return coachEvidence(db,who.uid,d.id);
 if(action==='prepareCoach'){
  const source=await owned(db,who,d.id);if(d.confirmed!==true||d.version!==source.version)throw new HttpsError('failed-precondition','Save and review the current evidence before confirming.');
  const prefs=await get(db,`teachingCoach/${who.uid}/settings/context`);if(prefs?.inquiries===false)throw new HttpsError('failed-precondition','Research inquiry context is disabled in Coach settings. Enable it only if you want to discuss this evidence.');
  const inquiryId=idOf(d.inquiryId);if(!await get(db,`teachingCoach/${who.uid}/inquiries/${inquiryId}`))denied();
  const packet=selectedPacket(source,d.selected);if(packet.evidence.some(e=>e.origin==='learner'))throw new HttpsError('failed-precondition','Use an anonymised summary instead of raw learner evidence.');
  await checkCorpusEvidence(db,packet.evidence,{ai:true});
  const ref=db.collection('linguisticsCoachPackets').doc();await ref.set({owner:who.uid,investigationId:d.id,sourceVersion:source.version,inquiryId,selected:packet.evidence.map(e=>e.id),purpose:String(d.purpose||'Discuss evidence and alternative explanations').slice(0,1000),expiresAt:Date.now()+3600000});await audit(db,who,'prepare-coach',ref.id);return {id:ref.id};
 }
 if(action==='attachInquiry'){
  const source=await owned(db,who,d.id);if(d.version!==source.version)throw new HttpsError('failed-precondition','The evidence changed. Review it before attaching.');const packet=selectedPacket(source,d.selected);if(packet.evidence.some(e=>e.origin==='learner'))throw new HttpsError('failed-precondition','Use a reviewed anonymised summary when attaching learner evidence to an inquiry.');
  const ref=db.doc(`teachingCoach/${who.uid}/inquiries/${idOf(d.inquiryId)}`);
  await db.runTransaction(async tx=>{const existing=await tx.get(ref);if(!existing.exists)denied();const links=existing.get('evidenceLinks')||[];const link={investigationId:d.id,selected:packet.evidence.map(e=>e.id),purpose:String(d.purpose||'Selected evidence for this inquiry').slice(0,1000),attachedAt:Date.now()};tx.update(ref,{evidenceLinks:[...links.filter(x=>x.investigationId!==d.id),link].slice(-30),version:(existing.get('version')||0)+1});});await audit(db,who,'attach-inquiry',d.id);return {attached:true};
 }
 throw new HttpsError('invalid-argument','Choose a supported investigation action.');
}

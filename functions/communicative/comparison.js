import {projectPictures,rehomePictures} from './pictures.js';
import {splitKey} from '../ai/import-question-core.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
function comparisonBody(content,nodes) {
  const walk=node=>{
    if(node?.type==='communicativeActivity') {
      const source=nodes[node.attrs?.id];if(!source)throw new HttpsError('failed-precondition','The saved activity cards could not be loaded. Reopen this version and try again.');
      const cards=(source.content??[]).flatMap(card=>[
        ...(card.attrs?.title?[{type:'heading',attrs:{level:3},content:[{type:'text',text:String(card.attrs.title)}]}]:[]),
        ...(card.attrs?.picture?.src?[{type:'paragraph',content:[{type:'picture',attrs:{src:card.attrs.picture.src,alt:card.attrs.picture.alt??''}}]}]:[]),
        ...(card.content??[]).map(walk),
      ]);
      return {type:'textBox',attrs:{label:source.attrs?.instruction??'',tone:'grey'},content:cards.length?cards:[{type:'paragraph'}]};
    }
    return {...node,...(node?.content?{content:node.content.map(walk)}:{})};
  };
  return splitKey(walk(content)).content;
}
export async function compareVersions(db,a,data) {
  if(!a.teacher)throw new HttpsError('permission-denied','Only the teacher can compare versions.');
  const comparison=a.root.collection('comparisons').doc(`${data.itemId}_${data.taskId}`);
  if(data.op==='hideVersions') {
    const old=await comparison.collection('views').get(),batch=db.batch();
    for(const view of old.docs)batch.delete(view.ref);
    batch.set(comparison,{itemId:data.itemId,taskId:data.taskId,visible:false,updatedAt:FieldValue.serverTimestamp()});
    await batch.commit();return {shared:0};
  }
  const task=await a.taskRef.get(),family=task.get('family')||data.taskId;
  if(family!==data.taskId)throw new HttpsError('failed-precondition','Open the main task to compare its versions.');
  const ids=[data.taskId,...(task.get('variants')??[])];
  if(ids.length<2||ids.length>20||ids.some(id=>typeof id!=='string'||! /^[A-Za-z0-9_-]{1,150}$/.test(id)))throw new HttpsError('failed-precondition','Add at least two task versions to compare.');
  const tasks=a.root.collection('items').doc(data.itemId).collection('tasks');
  const versions=await Promise.all(ids.map(async(id,n)=>{
    const ref=tasks.doc(id),snap=await ref.get();if(!snap.exists)throw new HttpsError('failed-precondition','A version is no longer available.');
    const [body,activities]=await Promise.all([snap.get('restricted')?ref.collection('private').doc('body').get():null,ref.collection('private').doc('activities').get()]);
    if(snap.get('restricted')&&(!body?.exists||!body.get('content')))throw new HttpsError('failed-precondition','A saved version could not be loaded. Reopen it and try again.');
    return {id,label:String(snap.get('variant')||String.fromCharCode(65+n)),title:String(snap.get('title')||''),instructions:String(snap.get('instructions')||''),content:await rehomePictures(db,a,comparisonBody(body?.get('content')??snap.get('content')??{type:'doc',content:[]},activities.get('nodes')??{}))};
  }));
  if(new TextEncoder().encode(JSON.stringify(versions)).length>650000)throw new HttpsError('failed-precondition','These versions are too large to compare together. Use uploaded pictures instead of pasted picture data.');
  if(data.op==='previewVersions')return {versions};
  const roster=await a.root.collection('learners').get();
  const all=roster.docs.map(d=>({id:d.id,uid:d.get('authUid')})).filter(p=>typeof p.uid==='string');
  let people=all;
  if(data.groupId){
    if(typeof data.groupSetId!=='string')throw new HttpsError('invalid-argument','Choose a saved group.');
    const set=await a.root.collection('groupSets').doc(data.groupSetId).get(),group=(set.get('groups')??[]).find(g=>g.id===data.groupId);
    if(!group)throw new HttpsError('failed-precondition','Choose an available group.');
    people=people.filter(p=>group.members.includes(p.id));
  }
  const old=await comparison.collection('views').get();
  const batch=db.batch();
  for(const view of old.docs)batch.delete(view.ref);
  if(data.op!=='hideVersions')for(const p of people)batch.set(comparison.collection('views').doc(p.uid),{versions:projectPictures(versions,data,true),itemId:data.itemId,taskId:data.taskId});
  batch.set(comparison,{itemId:data.itemId,taskId:data.taskId,visible:data.op!=='hideVersions',updatedAt:FieldValue.serverTimestamp()});
  await batch.commit();return {shared:data.op==='hideVersions'?0:people.length};
}

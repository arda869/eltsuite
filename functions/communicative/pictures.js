const sha256=async value=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
import {HttpsError} from 'firebase-functions/v2/https';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(id);
const denied=()=>new HttpsError('permission-denied','This picture is not available to you.');
// Only actual picture properties and rich-text image nodes carry asset references.
// Text, captions and arbitrary metadata cannot grant access to bytes.
export function mapPictureSources(value,map,parentKey=''){
  if(Array.isArray(value))return value.map(v=>mapPictureSources(v,map,parentKey));
  if(!value||typeof value!=='object')return value;
  const out={};
  for(const [key,child]of Object.entries(value)){
    if(key==='src'&&['picture','matchPicture','imageAttrs'].includes(parentKey)&&typeof child==='string')out[key]=map(child);
    else out[key]=mapPictureSources(child,map,key==='attrs'&&['picture','image'].includes(value.type)?'imageAttrs':key);
  }
  return out;
}
function privateAsset(src,classId){
  if(!src.startsWith('private-activity:'))return null;
  const parts=src.slice(17).split(':'),sourceClass=parts.length===2?parts[0]:classId,assetId=parts.at(-1);
  return validId(sourceClass?.startsWith('user~')?sourceClass.slice(5):sourceClass)&&validId(assetId)?{sourceClass,assetId}:null;
}
export function projectPictures(value,context,comparison=false){
  const prefix=comparison?`comparison-picture:${context.classId}:${context.itemId}:${context.taskId}:`:`activity-picture:${context.classId}:${context.itemId}:${context.taskId}:${context.activityId}:`;
  return mapPictureSources(value,src=>{const asset=privateAsset(src,context.classId);return asset?prefix+asset.assetId:src;});
}
export async function rehomePictures(db,a,value){
  const sources=new Set();mapPictureSources(value,src=>{const asset=privateAsset(src,a.context.classId);if(asset&&asset.sourceClass!==a.context.classId)sources.add(src);return src;});
  const replacements=new Map();
  for(const src of sources){
    const {sourceClass,assetId}=privateAsset(src,a.context.classId),personal=sourceClass.startsWith('user~'),source=db.doc(personal?`users/${sourceClass.slice(5)}`:`classes/${sourceClass}`),owner=personal?null:await source.get();
    if(!a.teacher||!(personal?sourceClass.slice(5)===a.uid:owner.get('teacherId')===a.uid||owner.get('coTeachers')?.[a.uid]?.role==='co'))throw new HttpsError('failed-precondition','Upload this private picture again in this class. Its original is not available to you.');
    const destinationId=/^copy_[a-f0-9]{64}$/.test(assetId)?assetId:'copy_'+await sha256(`${sourceClass}:${assetId}`),target=a.root.collection('activityMedia').doc(destinationId),existing=await target.get();
    if(existing.exists){replacements.set(src,`private-activity:${a.context.classId}:${target.id}`);continue;}
    const original=source.collection('activityMedia').doc(assetId),manifest=await original.get(),count=manifest.get('chunks');
    if(!Number.isInteger(count)||count<1||count>4)throw new HttpsError('failed-precondition','Upload this private picture again. Its original is no longer available.');
    const chunks=await db.getAll(...Array.from({length:count},(_,n)=>original.collection('chunks').doc(String(n))));
    if(chunks.some(chunk=>!chunk.exists))throw denied();
    const batch=db.batch();batch.set(target,manifest.data());for(let n=0;n<count;n++)batch.set(target.collection('chunks').doc(String(n)),{...chunks[n].data(),bytes:String(chunks[n].get('data')??'').length});await batch.commit();
    replacements.set(src,`private-activity:${a.context.classId}:${target.id}`);
  }
  return mapPictureSources(value,src=>replacements.get(src)??src);
}
function containsPicture(value,expected){let found=false;mapPictureSources(value,src=>{if(src===expected)found=true;return src;});return found;}
export async function readActivityPicture(db,a,data){
  if(!validId(data.assetId))throw denied();
  if(!a.teacher){
    const expected=data.comparison===true?`comparison-picture:${data.classId}:${data.itemId}:${data.taskId}:${data.assetId}`:`activity-picture:${data.classId}:${data.itemId}:${data.taskId}:${data.activityId}:${data.assetId}`;
    let permitted=false;
    if(data.comparison===true){
      const comparison=a.root.collection('comparisons').doc(`${data.itemId}_${data.taskId}`),[meta,view]=await Promise.all([comparison.get(),comparison.collection('views').doc(a.uid).get()]);
      permitted=meta.get('visible')===true&&containsPicture(view.get('versions'),expected);
    }else{
      const [view,live]=await Promise.all([a.run.collection('views').doc(a.uid).get(),a.root.collection('live').doc('state').get()]);
      permitted=(a.canOpenTask&&containsPicture(view.get('config'),expected))||containsPicture(live.get('spotlight.activity.config'),expected);
    }
    if(!permitted)throw denied();
  }
  const ref=a.root.collection('activityMedia').doc(data.assetId),snap=await ref.get(),chunks=snap.get('chunks');
  if(!snap.exists||!Number.isInteger(chunks)||chunks<1||chunks>4)throw denied();
  const parts=await db.getAll(...Array.from({length:chunks},(_,n)=>ref.collection('chunks').doc(String(n))));
  if(parts.some(p=>!p.exists||typeof p.get('data')!=='string'))throw denied();
  const bytes=parts.map(p=>p.get('data')).join('');
  if(!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(bytes)||bytes.length>850000)throw denied();
  return {data:bytes};
}

import {collection,doc,getDoc,writeBatch,serverTimestamp} from 'firebase/firestore';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {app,db} from '../lib/firebase';
import {mediaDoc} from '../lib/media';
import type {ArchiveItem} from '../lib/archive';

const validId=(id:string)=>/^[A-Za-z0-9_-]{1,150}$/.test(id);
const privatePrefix='private-activity:';
// A tilde cannot occur in a class ID, so personal scopes survive plain-text exports.
function scopeFor(space:string){
  const scope=space.startsWith('user:')?'user~'+space.slice(5):space;
  if(!validId(scope.startsWith('user~')?scope.slice(5):scope))throw new Error('Choose an available picture space.');
  return scope;
}
function sourceCollection(space:string){const scope=scopeFor(space);return scope.startsWith('user~')?collection(db,'users',scope.slice(5),'activityMedia'):collection(db,'classes',scope,'activityMedia');}
function parsePrivate(src:string,fallback:string){const parts=src.slice(privatePrefix.length).split(':');if(parts.length>2)throw new Error('Picture unavailable.');return {scope:scopeFor(parts.length===2?parts[0]:fallback),assetId:parts.at(-1)!};}

export const isActivityPicture=(src:string)=>/^(private-activity:|activity-picture:|comparison-picture:)/.test(src);
export async function savePrivateActivityPicture(classId:string,blob:Blob):Promise<string>{
  scopeFor(classId);
  if(!blob.type.startsWith('image/')||blob.size>600*1024)throw new Error('Choose a smaller picture.');
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
  return saveData(classId,data,blob.type,blob.size);
}
async function saveData(classId:string,data:string,type:string,size:number,assetId?:string){
  if(!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(data)||data.length>850000)throw new Error('Choose a smaller picture.');
  const scope=scopeFor(classId),ref=assetId?doc(sourceCollection(scope),assetId):doc(sourceCollection(scope)),batch=writeBatch(db),chunks=Math.ceil(data.length/250000);
  batch.set(ref,{type,size,chunks,createdAt:serverTimestamp()});
  for(let n=0;n<chunks;n++){const part=data.slice(n*250000,(n+1)*250000);batch.set(doc(ref,'chunks',String(n)),{data:part,bytes:part.length});}
  await batch.commit();return privatePrefix+scope+':'+ref.id;
}
export async function copyPrivateActivityPicture(classId:string,item:ArchiveItem):Promise<string>{
  if(item.link)return item.link;
  if(!item.home)throw new Error('Choose an available picture.');
  const snap=await getDoc(mediaDoc(item.home.classId,item.home.mediaId)),data=snap.get('data');
  if(typeof data!=='string')throw new Error('Choose an available picture.');
  return saveData(classId,data,String(snap.get('type')||'image/jpeg'),Number(snap.get('size')||0));
}
// Protected reads deliberately have no shared cache: a new request rechecks current access.
export async function resolveActivityPicture(classId:string,src:string):Promise<string>{
  if(src.startsWith(privatePrefix)){
    const {scope,assetId}=parsePrivate(src,classId);if(!validId(assetId))throw new Error('Picture unavailable.');
    const ref=doc(sourceCollection(scope),assetId),snap=await getDoc(ref),chunks=snap.get('chunks');
    if(!Number.isInteger(chunks)||chunks<1||chunks>4)throw new Error('Picture unavailable.');
    const parts=await Promise.all(Array.from({length:chunks},(_,n)=>getDoc(doc(ref,'chunks',String(n)))));
    return parts.map(part=>String(part.get('data')??'')).join('');
  }
  const parts=src.split(':'),comparison=parts[0]==='comparison-picture';
  if((comparison&&parts.length!==5)||(!comparison&&(parts[0]!=='activity-picture'||parts.length!==6)))throw new Error('Picture unavailable.');
  const [,pictureClass,itemId,taskId]=parts,activityId=comparison?'comparison':parts[4],assetId=parts.at(-1)!;
  const result=await httpsCallable<Record<string,unknown>,{data:string}>(getFunctions(app,'us-central1'),'communicativeActivity')({op:'picture',classId:pictureClass,itemId,taskId,activityId,assetId,comparison});
  return result.data.data;
}

function mapSources<T>(value:T,map:(src:string)=>string,parentKey=''):T{
  if(Array.isArray(value))return value.map(v=>mapSources(v,map,parentKey)) as T;
  if(!value||typeof value!=='object')return value;
  const node=value as Record<string,unknown>;
  return Object.fromEntries(Object.entries(node).map(([key,child])=>[key,
    (key==='src'||key==='bw')&&['picture','matchPicture','imageAttrs'].includes(parentKey)&&typeof child==='string'?map(child):mapSources(child,map,key==='attrs'&&['picture','image'].includes(String(node.type))?'imageAttrs':key)
  ])) as T;
}
// Copy before saving a portable library task into a destination class. Both reads and
// writes use the signed-in teacher's rules; possession of a source ID grants nothing.
export async function rehomeActivityPictures<T>(content:T,targetClassId:string):Promise<T>{
  const targetScope=scopeFor(targetClassId),sources=new Set<string>();
  mapSources(content,src=>{if(src.startsWith(privatePrefix)&&parsePrivate(src,targetClassId).scope!==targetScope)sources.add(src);return src;});
  if(!sources.size)return content;
  const replacements=new Map<string,string>();
  for(const src of sources){
    const {scope,assetId}=parsePrivate(src,targetClassId);if(!validId(assetId))throw new Error('Picture unavailable.');
    const digest=/^copy_[a-f0-9]{64}$/.test(assetId)?null:await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${scope}:${assetId}`)),destinationId=digest?'copy_'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join(''):assetId;
    const existing=await getDoc(doc(sourceCollection(targetScope),destinationId));
    if(existing.exists()){replacements.set(src,`${privatePrefix}${targetScope}:${destinationId}`);continue;}
    const manifest=await getDoc(doc(sourceCollection(scope),assetId)),data=await resolveActivityPicture(targetClassId,src);
    replacements.set(src,await saveData(targetClassId,data,String(manifest.get('type')||'image/jpeg'),Number(manifest.get('size')||0),destinationId));
  }
  return mapSources(content,src=>replacements.get(src)??src);
}

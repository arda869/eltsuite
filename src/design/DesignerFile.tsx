import { useEffect, useRef, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { loadAnyFile } from '../lib/fileStore';
import type { SharedDoc } from '../lib/sharedDocs';
import { StoryboardFile } from '../storyboard/StoryboardFile';
import { DesignFile } from './Editor';
import { pagesCol, elsCol, metaRef, storePicture, useDesign } from './model';
import './design.css';

import { isImageFile } from './files';
export { isImageFile } from './files';
export async function startDesigner(id:string, type:'image'|'storyboard') {
  const b=writeBatch(db);b.set(metaRef(id),{type},{merge:true});b.update(doc(db,'sharedDocs',id),{designType:type});
  if(type==='image')b.set(doc(pagesCol(id),'canvas'),{order:0,w:1080,h:1080,bg:'#ffffff'});
  await b.commit();
}
export function DesignerFile({d,canEdit}:{d:SharedDoc;canEdit:boolean}) {
  const {pages,meta}=useDesign(d.id);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [original,setOriginal]=useState('');
  useEffect(()=>{if(!isImageFile(d)||canEdit||pages===null||pages.length)return;let url='';let active=true;void loadAnyFile(d.id,d.file).then(blob=>{url=URL.createObjectURL(blob);if(active)setOriginal(url);else URL.revokeObjectURL(url);}).catch(()=>setError('Could not open the original image. Please reload to try again.'));return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[d.id,canEdit,pages]);
  const importing=useRef(false);
  useEffect(()=>{
    if(!isImageFile(d)||pages===null||pages.length||!canEdit||importing.current)return;
    importing.current=true;setBusy(true);
    void (async()=>{
      const picture=await storePicture(d.id,await loadAnyFile(d.id,d.file));
      const b=writeBatch(db);
      b.set(doc(pagesCol(d.id),'canvas'),{order:0,w:picture.w,h:picture.h,bg:'#ffffff'});
      b.set(doc(elsCol(d.id),'original'),{page:'canvas',t:'image',z:0,x:0,y:0,w:picture.w,h:picture.h,iw:picture.w,ih:picture.h,img:picture.id,name:d.title});
      await b.commit();
    })().catch(()=>setError('We could not open this image. Your original is unchanged. Reload to try again.')).finally(()=>setBusy(false));
  },[d.id,pages,canEdit]);
  if(error)return <p role="alert" className="dp-msg">{error}</p>;
  if(pages===null||busy)return <div className="dp-msg" role="status">Opening Designer…</div>;
  if(d.kind==='storyboard'||meta.type==='storyboard')return <StoryboardFile d={d} canEdit={canEdit}/>;
  if(pages.length||meta.type==='image')return <DesignFile d={d} canEdit={canEdit}/>;
  if(!canEdit&&isImageFile(d))return original?<img src={original} alt={d.title} style={{maxWidth:'100%',maxHeight:'85vh',objectFit:'contain'}}/>:<div className="dp-msg">Opening image…</div>;
  if(!canEdit)return <div className="dp-msg">This Designer file is empty.</div>;
  return <section className="dz-start"><div className="dz-start-in"><p className="dz-kicker">Designer</p><h1>What will you create?</h1><p className="dz-start-sub">Build a story, or make an image your own.</p><div className="dz-start-grid">{(['storyboard','image'] as const).map(type=><button className="dz-start-card" key={type} onClick={()=>{setBusy(true);void startDesigner(d.id,type).catch(()=>setError('Could not create your canvas. Please reload and try again.')).finally(()=>setBusy(false));}}><span aria-hidden="true" style={{fontSize:48}}>{type==='storyboard'?'▤':'◈'}</span><strong>{type==='storyboard'?'Storyboard':'Image'}</strong><span>{type==='storyboard'?'Scenes, characters and speech bubbles':'Create with AI, upload, crop, filter and add text'}</span></button>)}</div></div></section>;
}

import './InlineImages.css';
import { useState } from 'react';
import { useMyDocs, type SharedDoc } from '../lib/sharedDocs';
import { isImageFile } from './files';
import { loadAnyFile } from '../lib/fileStore';
import { useDesign, loadPicture, ensureFont, type DPage, type El } from './model';
import { pageBlob } from './tools';
import { artKey } from './render';
import { artImage, qrImage, searchPictures, type WebPic } from './assets';

export async function designPageImage(id:string,page:DPage,els:El[],accent:string) {
 const imgs=new Map<string,CanvasImageSource>();
 await Promise.all(els.filter(e=>e.page===page.id).map(async e=>{
  if(e.t==='image'&&e.img)imgs.set(e.img,await loadPicture(id,e.img));
  if(e.t==='art')imgs.set(artKey(e,accent),await artImage(e,accent));
  if(e.t==='qr'&&e.url)imgs.set('qr:'+e.url,await qrImage(e.url));
  if(e.font)await ensureFont(e.font);
 }));
 return pageBlob(page,els,{imgs,view:'all',accent},1.6);
}
type Pick=(blob:Blob,title:string,credit?:string)=>Promise<void>;
export function DesignerImages({uid,onPick,onBoard}:{uid?:string;onPick:Pick;onBoard:(d:SharedDoc)=>Promise<void>}) {
 const {mine,withMe}=useMyDocs(uid);const [q,setQ]=useState(''),[selected,setSelected]=useState<SharedDoc|null>(null);
 const docs=Array.from(new Map([...(mine??[]),...(withMe??[])].map(d=>[d.id,d])).values()).filter(d=>d.kind==='design'||d.kind==='storyboard'||isImageFile(d));
 return <section><label>Search Designer<input value={q} onChange={e=>setQ(e.target.value)}/></label>{selected?<><button type="button" className="btn" onClick={()=>setSelected(null)}>Back to designs</button><DesignPages key={selected.id} d={selected} onPick={onPick} onBoard={onBoard}/></>:<div className="inline-image-list">{mine===null||withMe===null?<p role="status">Loading designs…</p>:docs.filter(d=>d.title.toLowerCase().includes(q.toLowerCase())).map(d=><button type="button" className="btn" key={d.id} onClick={()=>setSelected(d)}>{d.title||'Untitled design'}<small>{d.kind==='storyboard'||d.designType==='storyboard'?'Storyboard':'Image design'}</small></button>)}{mine!==null&&withMe!==null&&!docs.filter(d=>d.title.toLowerCase().includes(q.toLowerCase())).length&&<p>No matching designs. Saved Designer files appear here automatically.</p>}</div>}</section>;
}
function DesignPages({d,onPick,onBoard}:{d:SharedDoc;onPick:Pick;onBoard:(d:SharedDoc)=>Promise<void>}) {
 const {pages,els,meta}=useDesign(d.id);const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const run=async(f:()=>Promise<void>)=>{setBusy(true);setError('');try{await f();}catch{setError('Could not add this design. Your slide is unchanged. Try again.');}finally{setBusy(false);}};
 const board=d.kind==='storyboard'||d.designType==='storyboard'||meta.type==='storyboard';
 return <div><h3>{d.title}</h3>{board?<button type="button" className="btn" disabled={busy} onClick={()=>void run(()=>onBoard(d))}>Insert storyboard</button>:pages===null?<p role="status">Loading pages…</p>:pages.length?pages.map((p,i)=><button type="button" className="btn" key={p.id} disabled={busy} onClick={()=>void run(async()=>onPick(await designPageImage(d.id,p,els,meta.accent??'#c8764a'),d.title))}>Insert {p.name||`page ${i+1}`}</button>):isImageFile(d)?<button type="button" className="btn" disabled={busy} onClick={()=>void run(async()=>onPick(await loadAnyFile(d.id,d.file),d.title))}>Insert image</button>:<p>This design has no pages yet.</p>}{busy&&<p role="status">Preparing your image…</p>}{error&&<p role="alert">{error}</p>}</div>;
}
export function CommonsImages({onPick}:{onPick:Pick}) {
 const [q,setQ]=useState(''),[pics,setPics]=useState<WebPic[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(false);
 return <section><form onSubmit={async e=>{e.preventDefault();if(!q.trim())return;setBusy(true);setError('');try{setPics(await searchPictures(q));setSearched(true);}catch{setError('Wikimedia search is unavailable. Please try again.');}finally{setBusy(false);}}}><label>Search Wikimedia Commons<input value={q} onChange={e=>setQ(e.target.value)} placeholder="For example, a street market"/></label><button className="btn" disabled={busy}>Search</button>{!q.trim()&&<p className="hint">Enter a subject to search.</p>}</form>{busy&&<p role="status">Loading images…</p>}{error&&<p role="alert">{error}</p>}<div className="inline-image-list">{pics.map(p=><button type="button" className="btn" key={p.id} disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await fetch(p.url);if(!r.ok)throw Error();await onPick(await r.blob(),p.title,p.credit);}catch{setError('Could not insert this image. Please try another result.');}finally{setBusy(false);}}}><img src={p.thumb} alt={p.title} loading="lazy"/><strong>{p.title}</strong><small>{p.credit}</small></button>)}</div>{searched&&!busy&&!pics.length&&<p>No images found. Try another search.</p>}</section>;
}

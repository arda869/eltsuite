import {useRef,useState} from 'react';
import {doc,writeBatch} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {useAuth} from '../lib/auth';
import {newSharedDoc} from '../lib/sharedDocs';
import {AiImages} from './AiImages';
import {elsCol,pagesCol,metaRef,storePicture} from './model';
import './design.css';

export function InlineAiImage({onPick}:{onPick:(blob:Blob,title:string)=>Promise<void>}) {
 const {user,profile}=useAuth();
 const [id,setId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const saved=useRef<Blob|null>(null);
 const start=async()=>{if(!user||busy)return;setBusy(true);setError('');try{setId(await newSharedDoc({uid:user.uid,name:profile?.displayName||'Teacher'},'design','AI classroom image'));}catch{setError('Could not open image creation. Please try again.');}finally{setBusy(false);}};
 return <section aria-label="Create an inline AI image"><p>Create and review an image here, then insert it into your activity or document. A reusable copy is saved in Designer.</p>{!id?<><button type="button" className="btn primary" disabled={busy||!user} onClick={()=>void start()}>{busy?'Opening image creator…':'Create an image'}</button>{!user&&<p>Sign in to create an image.</p>}</>:<AiImages applyLabel="Insert image" cx={{d:{id},els:[],sel:[],addPicture:async(blob)=>{
  if(saved.current!==blob){const picture=await storePicture(id,blob);const batch=writeBatch(db);batch.set(metaRef(id),{type:'image'},{merge:true});batch.update(doc(db,'sharedDocs',id),{designType:'image'});batch.set(doc(pagesCol(id),'canvas'),{order:0,w:picture.w,h:picture.h,bg:'#ffffff'});batch.set(doc(elsCol(id),'image'),{page:'canvas',t:'image',z:0,x:0,y:0,w:picture.w,h:picture.h,iw:picture.w,ih:picture.h,img:picture.id,name:'AI classroom image'});await batch.commit();saved.current=blob;}
  await onPick(blob,'AI classroom image');
 }}}/>}{error&&<p role="alert">{error}</p>}</section>;
}

import {useEffect,useState} from 'react';
import {audioUrl} from '../lib/media';
import {useEditorClass} from './context';
export function DefinitionImage({src='',alt='',className,space}:{src?:string;alt?:string;className:string;space?:string}){
 const ctx=useEditorClass(),home=space||ctx.classId;
 const [resolved,setResolved]=useState('');
 useEffect(()=>{
  let active=true;setResolved('');
  if(src.startsWith('media:')&&home)void audioUrl(home,src.slice(6)).then(v=>{if(active)setResolved(v);}).catch(()=>{});
  else if(/^https:\/\//i.test(src)||/^data:image\/(jpeg|png|webp);base64,/i.test(src))setResolved(src);
  return()=>{active=false;};
 },[home,src]);
 // Direct URLs also render during worksheet server rendering; media is resolved
 // by sheetPictures first. Keep images in colour so Designer styles survive.
 const url=src.startsWith('media:')?resolved:/^https:\/\//i.test(src)||/^data:image\/(jpeg|png|webp);base64,/i.test(src)?src:'';
 return url?<img className={className} src={url} alt={alt}/>:null;
}

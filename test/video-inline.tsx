import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import './mock/seed';
import {AuthProvider,useAuth} from '../src/lib/auth';
import {TaskRenderer} from '../src/components/TaskRenderer';
import {TaskEditor} from '../src/editor/TaskEditor';
import {assetBlob} from '../src/video/library';
import {saveSound} from '../src/lib/archive';
import {mediaDoc} from '../src/lib/media';
import {updateDoc} from 'firebase/firestore';
import type {JSONContent} from '@tiptap/react';
import '../src/styles.css';
import '../src/friday-ui.css';
function Fixture(){const {user}=useAuth(),[content,setContent]=useState<JSONContent|null>(null),[status,setStatus]=useState('Ready');const space='user:'+user?.uid;
 const prepare=async()=>{try{setStatus('Preparing');const source=localStorage.getItem('videoTestSource');if(!source)throw Error('Make test media first.');const blob=await assetBlob(source);const {mediaId}=await saveSound(space,blob,{title:'Inline classroom video',duration:2});await updateDoc(mediaDoc(space,mediaId),{video:true});const video={type:'inlineMedia',attrs:{media:mediaId,kind:'video',title:'Inline classroom video',scriptMode:'none',size:'s'}};const p={type:'paragraph',content:[{type:'text',text:'Watch this: '},video,{type:'text',text:' What happens next?'}]};setContent({type:'doc',content:[p,{type:'textBox',attrs:{style:'email',label:'A video for you',meta:'Teacher'},content:[p]},{type:'dialogue',attrs:{speakers:['A','B']},content:[{type:'dialogueLine',attrs:{who:0},content:p.content}]},{type:'table',content:[{type:'tableRow',content:[{type:'tableHeader',content:[{type:'paragraph',content:[{type:'text',text:'Watch and answer'}]}]}]},{type:'tableRow',content:[{type:'tableCell',content:[p]}]}]},{type:'reveal',attrs:{label:'Open the video note'},content:[p]}]});setStatus('Inline videos ready');}catch(e){setStatus((e as Error).message);}};
 return <main style={{maxWidth:1000,margin:'24px auto',padding:20}}><h1>Inline video examples</h1><p>Local synthetic media only.</p><button onClick={()=>void prepare()}>Prepare inline video examples</button><p role="status">{status}</p>{content&&<><h2>Teacher editor</h2><TaskEditor content={content} onChange={setContent} classId={space}/><h2>Learner preview</h2><TaskRenderer content={content} responses={{}} classId={space}/></>}</main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><Fixture/></AuthProvider></BrowserRouter>);

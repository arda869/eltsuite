import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useEditor,EditorContent} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {BlockHandles} from '../src/editor/BlockMenu';
import {TableHandles} from '../src/editor/TableHandles';
import {LineAdder} from '../src/editor/LineAdder';
import {TooltipLayer} from '../src/components/Tooltip';
import {InsertGallery,hasGalleryPreview} from '../src/editor/InsertGallery';
import {COMMANDS} from '../src/editor/TaskEditor';
import {docCommands,docSections} from '../src/collab/docKit';
import {worksheetHtml} from '../src/lib/worksheetHtml';
import {lessonDocx} from '../src/lib/worksheet';
import {unzipSync,strFromU8} from 'fflate';
import {questionAcceptsTypedAnswer} from '../src/lib/questions';
import '../src/styles.css';
function Fixture(){
 const [host,setHost]=useState<HTMLDivElement|null>(null),[gallery,setGallery]=useState(false),[status,setStatus]=useState(''),[picked,setPicked]=useState('');
 const editor=useEditor({extensions:[StarterKit,Table,TableRow,TableHeader,TableCell],content:'<p>Before the table.</p><table><tbody><tr><th><p>Name</p></th><th><p>Choice</p></th></tr><tr><td><p>Ada</p></td><td><p>A quieter street</p></td></tr></tbody></table><p>After the table.</p>'});
 async function verify(){
  const missing=[...COMMANDS,...docCommands()].filter(c=>!['__more'].includes(c.key)&&!hasGalleryPreview(c.key));
  if(missing.length)throw Error('Missing gallery previews: '+missing.map(c=>c.key));
  if(questionAcceptsTypedAnswer('mcq')||questionAcceptsTypedAnswer('match')||!questionAcceptsTypedAnswer('gap')||!questionAcceptsTypedAnswer('writing'))throw Error('Spelling question types');
  const task={title:'A title kept for navigation',instructions:'',blocks:[{kind:'subtask' as const,letter:'a',text:'Compare the two plans.',blocks:[{kind:'p' as const,runs:[{t:'First content'}]}]},{kind:'subtask' as const,letter:'b',text:'Agree on a decision.',blocks:[{kind:'p' as const,runs:[{t:'Second content'}]}]}],answers:[],marks:0};
  const items=[{kind:'task' as const,task}],opts={header:false,key:false,marks:false};
  const html=worksheetHtml('Friday wishes',items,opts);
  const parsed=(new DOMParser().parseFromString(html,'text/html').querySelector('#u-main') as HTMLTemplateElement).content;
  if(!parsed.querySelector('.ex-head .subex-l')||!parsed.querySelector('.ex-head')?.textContent?.includes('Compare the two plans.'))throw Error('PDF first subtask header');
  setStatus('Checking Word export…');
  const blob=await lessonDocx('Friday wishes',items,opts);const xml=strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml']);
  if(!xml.includes('Compare the two plans.')||xml.includes('A title kept for navigation'))throw Error('Word first subtask header');
  setStatus('Checking print preview…');const frame=document.querySelector<HTMLIFrameElement>('#worksheet')!;frame.srcdoc=html;
  setStatus('PASS all gallery previews, typed-answer spelling filter, PDF and Word first sub-task heading');
 }
 return <main style={{padding:70,maxWidth:1000,margin:'auto'}}><h1>Friday editor verification</h1><div style={{transform:'translateZ(0)',overflow:'hidden',height:55,background:'#eee'}}><button data-tip="This explanation must float above every container" style={{margin:10}}>Tooltip target</button><TooltipLayer/></div><button onClick={()=>setGallery(true)}>Add to document</button><button onClick={()=>void verify().catch(e=>setStatus('FAIL '+e.message))}>Verify previews and exports</button><output>{status}</output><p>{picked}</p>{editor&&<div className="editor-host cd-host" ref={setHost} style={{margin:'65px 30px',border:'1px solid #ddd'}}><EditorContent editor={editor}/><LineAdder editor={editor} host={host}/><BlockHandles editor={editor} host={host} space="test"/><TableHandles editor={editor} host={host}/></div>}<button onClick={()=>editor?.commands.undo()}>Undo</button>{gallery&&<InsertGallery title="Add to document" commands={docCommands()} sections={docSections()} onPick={k=>{setPicked(k);setGallery(false);}} onClose={()=>setGallery(false)}/>}<iframe id="worksheet" title="Worksheet preview" style={{width:'100%',height:450,border:0}}/></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../lib/auth';
import {newSharedDoc} from '../lib/sharedDocs';
import {saveStart} from '../lib/fileStore';
import {useChats,sendMsg,chatTitle} from '../lib/chat';
import {useDirectory} from '../lib/directory';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type HandoffProps={classId:string;itemId?:string;text:string;verifyAccess:()=>Promise<void>};
export function PlanningHandoff(props:HandoffProps){const [open,setOpen]=useState(false);return <details className="intelligence-handoff" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Use this advice elsewhere</summary>{open&&<HandoffControls {...props}/>}</details>;}
function HandoffControls({classId,itemId,text,verifyAccess}:HandoffProps){
 const {user}=useAuth(),navigate=useNavigate(),directory=useDirectory(),chats=useChats(user?.uid);
 const [target,setTarget]=useState<'collab'|'reflection'|'message'|null>(null),[draft,setDraft]=useState(text),[chatId,setChatId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const ownDoc=useState<{id:string;ready:boolean}|null>(null),[made,setMade]=ownDoc;
 const path=`/class/${classId}${itemId?'/lesson/'+itemId:''}`,link=window.location.origin+path;
 const eligible=(chats??[]).filter(c=>c.members.every(id=>c.roles[id]==='teacher'));
 const act=async()=>{setError('');if(!user)return;if(target==='message'&&!chatId){setError('Choose a teacher conversation before sending.');return;}if(target!=='message'&&!draft.trim()){setError('Add the planning note you want to keep.');return;}setBusy(true);try{await verifyAccess();if(target==='collab'){
  const id=made?.id??await newSharedDoc({uid:user.uid,name:user.displayName??'Teacher'},'doc','Lesson planning note');setMade({id,ready:false});await saveStart(id,draft.split('\n').map(line=>'<p>'+escape(line)+'</p>').join('')+`<p><a href="${escape(link)}">Open the source lesson or class</a></p>`);setMade({id,ready:true});navigate('/doc/'+id);
 }else if(target==='reflection'){navigate('/development?section=reflections',{state:{lessonIntelligenceReflection:{title:'Reflecting on a lesson',text:draft.slice(0,6000),lesson:path}}});}else if(target==='message'){
  const chat=eligible.find(c=>c.id===chatId);if(!chat||!directory?.me)throw Error('This conversation is no longer available.');await sendMsg(chat,directory.me,{text:'Planning link: '+link});setNotice('Link sent. Existing class access is still required.');setTarget(null);
 }}catch(e){setError(e instanceof Error?e.message:'The handoff could not finish. Your note is still here.');}finally{setBusy(false);}};
 return <div><p>Choose the content and destination. Nothing is shared automatically.</p><div className="intelligence-actions"><button className="btn small" onClick={()=>{setTarget('collab');setDraft(text);}}>Planning note in Collab</button><button className="btn small" onClick={()=>{setTarget('reflection');setDraft(text);}}>Private reflection</button><button className="btn small" onClick={()=>setTarget('message')}>Send a link in Messages</button></div>{target&&<section>{target==='message'?<><p>Only the class or lesson link is sent. The message contains no evaluation, scores or learner work. Recipients still need existing access to open it.</p><label>Teacher conversation<select value={chatId} onChange={e=>setChatId(e.target.value)}><option value="">Choose a conversation</option>{eligible.map(c=><option key={c.id} value={c.id}>{chatTitle(c,user?.uid??'')}</option>)}</select></label>{!eligible.length&&<p>No teacher conversations are available. Start one in Messages first.</p>}</>:<><label>Approved planning note<textarea rows={5} maxLength={6000} value={draft} onChange={e=>setDraft(e.target.value)}/></label><p>{target==='collab'?'A new private Collab document will be made. Use its existing sharing controls if you later want to invite colleagues.':'This opens an unsaved reflection in Development Studio. Review it and save there; it is not automatically shared with the Teaching Coach.'}</p></>}<button className="btn primary" disabled={busy} onClick={()=>void act()}>{busy?'Preparing…':target==='message'?'Send this link':target==='collab'?'Make private planning note':'Open reflection draft'}</button><button className="btn" disabled={busy} onClick={()=>setTarget(null)}>Cancel</button></section>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</div>;
}

import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../lib/auth';
import {isProxyTab} from '../lib/proxy';
import {CoachConversation} from './CoachConversation';
import {readCoachPanel,setCoachPanel,type CoachPanelState} from './panelState';
import './coach.css';
export function CoachPanel(){
 const {user,profile}=useAuth();
 const [panel,setPanel]=useState(readCoachPanel);
 useEffect(()=>{const change=(e:Event)=>setPanel((e as CustomEvent<CoachPanelState|null>).detail);window.addEventListener('elt-coach-panel',change);return()=>window.removeEventListener('elt-coach-panel',change);},[]);
 if(!user||profile?.role!=='teacher'||isProxyTab()||!panel||panel.uid!==user.uid)return null;
 return <aside className={'coach coach-floating'+(panel.min?' is-minimised':'')} aria-label="Pinned Teaching Coach"><header className="coach-floating-bar"><strong>Teaching Coach</strong><button className="btn" aria-label={panel.min?'Expand Teaching Coach':'Minimise Teaching Coach'} aria-expanded={!panel.min} onClick={()=>setCoachPanel({...panel,min:!panel.min})}>{panel.min?'+':'−'}</button><Link className="btn" aria-label="Open Teaching Coach in full view" onClick={()=>setCoachPanel(null)} to={'/development?section=coach&conversation='+encodeURIComponent(panel.conversationId)}>↗</Link><button className="btn" aria-label="Unpin Teaching Coach" title="Close panel; conversation stays in History" onClick={()=>setCoachPanel(null)}>×</button></header><div className="coach-floating-body" hidden={!!panel.min}><CoachConversation uid={user.uid} initialConversationId={panel.conversationId} context={panel.context} compact/></div></aside>;
}

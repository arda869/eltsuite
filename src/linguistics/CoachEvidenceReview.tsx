import {getFunctions,httpsCallable} from 'firebase/functions';
import {app} from '../lib/firebase';
import {useEffect,useState} from 'react';
import {api,type Packet} from './model';
import {EvidenceView} from './EvidenceView';
export function CoachEvidenceReview({id,onConfirm}:{id:string;onConfirm:()=>void}){
 const [packet,setPacket]=useState<Packet|null>(null),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{let alive=true;setConfirmed(false);setPacket(null);setError('');void (id.startsWith('obs_')?httpsCallable<Record<string,unknown>,{packet:Packet}>(getFunctions(app,'us-central1'),'classroomObservation')({action:'coachPacket',id}).then(r=>r.data):api('coachPacket',{id})).then(r=>{if(alive)setPacket(r.packet);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[id]);
 return <section className="ling-panel"><h3>Selected evidence for this conversation</h3>{error?<p role="alert">{error}</p>:packet?<><details open={!confirmed}><summary>{packet.title} · exact evidence preview</summary><EvidenceView data={packet}/></details><p>This selected evidence and its inquiry are checked again on every request. Nothing is added to your journal automatically. Research inquiry context settings still apply.</p>{!confirmed?<button className="btn" onClick={()=>{setConfirmed(true);onConfirm();}}>Confirm this evidence for the conversation</button>:<p role="status">Evidence confirmed for this conversation.</p>}</>:<p>Opening the selected evidence…</p>}<a href="/development?section=coach">Continue without this evidence</a></section>;
}

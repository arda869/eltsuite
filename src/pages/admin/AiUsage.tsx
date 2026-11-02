import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '../../lib/firebase';
import { Select } from '../../components/Select';
import { Panel } from './ui';
import './ai-usage.css';
type Person = { uid:string; name:string; email:string; role:string };
type Feature = { id:string; label:string; defaultLimit:number };
type Release='live'|'testing'|'off';
type Releases={features:Feature[];states:Record<string,Release>;version:number};
type Settings = { features:Feature[]; limits:Record<string,number|null>; testingAccess:string[]; counts:Record<string,number>; version:number; day:string; isAdmin:boolean };
const request=async(data:Record<string,unknown>)=>(await httpsCallable<Record<string,unknown>,Settings>(getFunctions(app,'us-central1'),'adminAiUsage')(data)).data;
const errorText=(e:unknown)=>e instanceof Error?e.message:'The allowances could not be loaded. Please try again.';
export function AiUsage() {
 const [people,setPeople]=useState<Person[]>([]),[uid,setUid]=useState(''),[settings,setSettings]=useState<Settings|null>(null);
 const [limits,setLimits]=useState<Record<string,number|null>>({}),[inputs,setInputs]=useState<Record<string,string>>({});
 const [testingAccess,setTestingAccess]=useState<string[]>([]),[releases,setReleases]=useState<Releases|null>(null);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>onSnapshot(collection(db,'users'),snapshot=>setPeople(snapshot.docs.map(d=>({uid:d.id,name:String(d.get('displayName')??''),email:String(d.get('email')??''),role:String(d.get('role')??'User')})).sort((a,b)=>(a.name||a.email||a.uid).localeCompare(b.name||b.email||b.uid))),()=>setError('The user list could not be loaded. Refresh to try again.')),[]);
 useEffect(()=>{
  setSettings(null);setError('');setNote('');if(!uid)return;
  let cancelled=false;setLoading(true);
  request({action:'get',uid}).then(s=>{if(!cancelled){setSettings(s);setLimits(s.limits);setTestingAccess(s.testingAccess??[]);setInputs(Object.fromEntries(Object.entries(s.limits).filter(([,v])=>v!==null).map(([k,v])=>[k,String(v)])));}}).catch(e=>{if(!cancelled)setError(errorText(e));}).finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;};
 },[uid,reload]);
 const dirty=settings!==null&&(JSON.stringify(limits)!==JSON.stringify(settings.limits)||JSON.stringify([...testingAccess].sort())!==JSON.stringify([...(settings.testingAccess??[])].sort()));
 const invalid=settings?.features.some(f=>Object.hasOwn(limits,f.id)&&limits[f.id]!==null&&(!/^\d+$/.test(inputs[f.id]??'')||Number(inputs[f.id])>1000000));
 async function save() {
  if(!settings||saving||invalid)return;
  setSaving(true);setError('');setNote('');
  try {const s=await request({action:'save',uid,limits,testingAccess,version:settings.version});setSettings(s);setLimits(s.limits);setTestingAccess(s.testingAccess??[]);setNote('AI allowances saved. Testing access also applies to the next new request.');}
  catch(e){setError(errorText(e));}finally{setSaving(false);}
 }
 return <><FeatureReleases onLoaded={setReleases}/><Panel title="Per-user AI allowances and testing access">
  <p>Choose a teacher or learner and set how many times they can use each feature per day. Super admins always have unlimited AI use.</p>
  <div className="ai-usage-user"><Select value={uid} options={[{v:'',label:'Choose a user',icon:'person'},...people.map(p=>({v:p.uid,label:p.name||p.email||p.uid,hint:[p.email,p.role].filter(Boolean).join(' · '),icon:'person'}))]} onChange={setUid} label="AI allowances for user" search disabled={saving||dirty} /></div>
  {dirty&&<p className="hint">Save or discard your changes before choosing another user.</p>}
  {loading&&<p role="status">Loading AI allowances…</p>}
  {error&&<p role="alert">{error} <button type="button" className="btn" onClick={()=>setReload(n=>n+1)} disabled={saving}>Reload allowances</button></p>}
  {settings&&<>
   <p className="hint">Daily allowances reset at 00:00 UTC. Zero blocks a feature. A new generation attempt counts once, including an attempt that fails after it starts. Opening saved results never counts. Today: {settings.day}.</p>
   {settings.isAdmin?<p role="status">This user is a super admin. All AI features are unlimited, including songs and videos. Application usage and monthly budget caps do not apply.</p>:<p className="hint">Daily limits do not enable features the user cannot access. Lesson assistant and help requests also use the existing shared monthly service budgets.</p>}
   <div className="ai-usage-list">{settings.features.map(f=>{
    const mode=!Object.hasOwn(limits,f.id)?'default':limits[f.id]===null?'unlimited':'custom';
    return <div className="ai-usage-row" key={f.id}>
     <div><strong>{f.label}</strong><span className="hint">{settings.counts[f.id]??0} used today{settings.isAdmin?' · Unlimited':''} · {releases?.states[f.id]??'live'}</span>{!settings.isAdmin&&releases?.states[f.id]==='testing'&&<label><input type="checkbox" aria-label={`${f.label} testing access`} disabled={saving} checked={testingAccess.includes(f.id)} onChange={e=>{setTestingAccess(old=>e.target.checked?[...old,f.id]:old.filter(id=>id!==f.id));setNote('');}}/>Allow this user to test this feature</label>}</div>
     {!settings.isAdmin&&<div className="ai-usage-controls"><Select label={`${f.label} allowance`} value={mode} options={[{v:'default',label:`Default (${f.defaultLimit}/day)`,icon:'timer'},{v:'custom',label:'Custom daily limit',icon:'edit'},{v:'unlimited',label:'Unlimited',icon:'check'}]} disabled={saving} onChange={v=>{setNote('');setLimits(old=>{const next={...old};if(v==='default')delete next[f.id];else next[f.id]=v==='unlimited'?null:f.defaultLimit;return next;});if(v==='custom')setInputs(old=>({...old,[f.id]:String(f.defaultLimit)}));}} />
      {mode==='custom'&&<label className="ai-usage-number">Uses per day<input className="hq-in" type="number" min="0" max="1000000" step="1" aria-label={`${f.label} uses per day`} value={inputs[f.id]??''} disabled={saving} onChange={e=>{const value=e.target.value;setInputs(old=>({...old,[f.id]:value}));setLimits(old=>({...old,[f.id]:/^\d+$/.test(value)?Number(value):-1}));setNote('');}} /></label>}
     </div>}
    </div>;
   })}</div>
   {!settings.isAdmin&&<div className="ai-usage-actions"><button type="button" className="btn primary" disabled={!dirty||saving||invalid} onClick={()=>void save()}>{saving?'Saving…':'Save AI allowances'}</button><button type="button" className="btn" disabled={!dirty||saving} onClick={()=>setReload(n=>n+1)}>Discard changes</button>{invalid&&<span role="alert">Enter a whole number from 0 to 1,000,000 beside each custom allowance.</span>}</div>}
  </>}
  <p role="status">{note}</p>
 </Panel></>;
}

function FeatureReleases({onLoaded}:{onLoaded:(r:Releases)=>void}){
 const [saved,setSaved]=useState<Releases|null>(null),[states,setStates]=useState<Record<string,Release>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 const api=async(data:Record<string,unknown>)=>(await httpsCallable<Record<string,unknown>,Releases>(getFunctions(app,'us-central1'),'adminAiUsage')(data)).data;
 const load=async()=>{setBusy(true);setError('');try{const r=await api({action:'releaseGet'});setSaved(r);setStates(r.states);onLoaded(r);}catch(e){setError(errorText(e));}finally{setBusy(false);}};
 useEffect(()=>{void load();},[]); // eslint-disable-line react-hooks/exhaustive-deps
 const dirty=saved!==null&&JSON.stringify(states)!==JSON.stringify(saved.states);
 const save=async()=>{if(!saved)return;setBusy(true);setError('');setNote('');try{const r=await api({action:'releaseSave',states,version:saved.version});setSaved(r);setStates(r.states);onLoaded(r);setNote('Feature states saved. New requests use these settings.');}catch(e){setError(errorText(e));}finally{setBusy(false);}};
 return <Panel title="AI feature releases"><p>Mark verified features Live. Testing features are available only to selected users. Off blocks new requests. Super admins retain access for verification; saved results remain available.</p>{!saved&&busy&&<p role="status">Loading feature states…</p>}{error&&<p role="alert">{error} <button className="btn" disabled={busy} onClick={()=>void load()}>Reload feature states</button></p>}{saved&&<><div className="ai-usage-list">{saved.features.map(f=><div className="ai-release-row ai-usage-controls" key={f.id}><strong>{f.label}</strong><label>Release state<select aria-label={`${f.label} release state`} disabled={busy} value={states[f.id]??'live'} onChange={e=>{setStates(old=>({...old,[f.id]:e.target.value as Release}));setNote('');}}><option value="live">Live</option><option value="testing">Testing</option><option value="off">Off</option></select></label></div>)}</div><div className="ai-usage-actions"><button className="btn primary" disabled={!dirty||busy} onClick={()=>void save()}>{busy?'Saving…':'Save feature states'}</button><button className="btn" disabled={!dirty||busy} onClick={()=>{setStates(saved.states);setError('');}}>Discard changes</button>{!dirty&&<span className="hint">Change a feature state to save an update.</span>}</div></>}<p role="status">{note}</p></Panel>;
}

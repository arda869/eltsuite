import { AiUsage } from './AiUsage';
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import type { Teacher } from '../../lib/admin';
import { Empty, PageHead, Panel, Who } from './ui';

export function SuperAi({ teachers, loading }: { teachers: Teacher[]; loading: boolean }) {
  const { user } = useAuth();
  const [grants, setGrants] = useState<Record<string, boolean> | null>(null);
  const [intelligenceGrants,setIntelligenceGrants]=useState<Record<string,boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => onSnapshot(collection(db, 'aiPilot'), snapshot => {
    setGrants(Object.fromEntries(snapshot.docs.map(d => [d.id, d.data().enabled === true])));
    setIntelligenceGrants(Object.fromEntries(snapshot.docs.map(d=>[d.id,d.data().lessonIntelligence===true])));
    setError('');
  }, () => { setGrants(null); setError('Access settings could not be loaded. Refresh to try again.'); }), []);
  async function toggle(teacher: Teacher) {
    if (!user || busy || !grants) return;
    const enabled = grants[teacher.uid] !== true;
    setBusy(teacher.uid); setError(''); setNote('');
    try {
      await setDoc(doc(db, 'aiPilot', teacher.uid), { enabled, updatedBy: user.uid, updatedAt: serverTimestamp() }, {merge:true});
      setNote(`AI access turned ${enabled ? 'on' : 'off'} for ${teacher.name || teacher.email}.`);
    } catch { setError('The access change was not saved. Please try again.'); }
    finally { setBusy(null); }
  }
  async function toggleIntelligence(teacher:Teacher){if(!user||busy||!grants?.[teacher.uid])return;setBusy(teacher.uid);setError('');try{await setDoc(doc(db,'aiPilot',teacher.uid),{enabled:true,lessonIntelligence:!intelligenceGrants[teacher.uid],updatedBy:user.uid,updatedAt:serverTimestamp()},{merge:true});setNote(`Lesson Intelligence preview turned ${intelligenceGrants[teacher.uid]?'off':'on'} for ${teacher.name||teacher.email}.`);}catch{setError('The preview access change was not saved. Please try again.');}finally{setBusy(null);}}
  const visible = teachers.filter(t => `${t.name} ${t.email}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="hq-page">
    <PageHead title="AI usage and access" lede="Manage each user’s AI allowances and choose who can use the lesson assistant." />
    <AiUsage />
    <Panel title="Lesson assistant access and budget">
      <p>Enabled teachers share the US$20 monthly API allowance. Super admins are exempt from application usage and monthly budget caps; their usage is accounted for separately. For ordinary users, generation stops when the shared budget cannot cover a request. Saved plans remain available.</p>
      <p className="hint">Turning access off blocks subsequent assistant requests. A generation already in progress may finish.</p>
    </Panel>
    <Panel title="Teacher access">
      <p className="hint">Lesson Intelligence is a separate preview. Turning it off preserves original lesson creation and saved work.</p>
      <input className="hq-in" type="search" aria-label="Find a teacher" placeholder="Search by name or email" value={search} onChange={e => setSearch(e.target.value)} />
      {error && <p role="alert">{error}</p>}
      <p role="status">{note}</p>
      {loading || grants === null ? <p>{error ? 'Access controls unavailable.' : 'Loading access settings…'}</p> : !visible.length ? <Empty title="No matching teachers" text="Try a different name or email." /> :
        <ul className="hq-supers">{visible.map(t => <li key={t.uid}>
          <Who name={t.name || t.email} sub={t.email} />
          <button type="button" role="switch" aria-checked={grants[t.uid] === true} aria-label={`AI access for ${t.email}`} className={`btn ${grants[t.uid] ? 'primary' : ''}`} disabled={busy !== null} onClick={() => void toggle(t)}>
            {busy === t.uid ? 'Saving…' : grants[t.uid] ? 'On' : 'Off'}
          </button>
          <div><button type="button" role="switch" aria-checked={intelligenceGrants[t.uid]===true} aria-label={`Lesson Intelligence preview for ${t.email}`} className="btn" disabled={busy!==null||!grants[t.uid]} onClick={()=>void toggleIntelligence(t)}>{intelligenceGrants[t.uid]?'Preview on':'Preview off'}</button>{!grants[t.uid]&&<small>Enable AI access first.</small>}</div>
        </li>)}</ul>}
    </Panel>
  </div>;
}

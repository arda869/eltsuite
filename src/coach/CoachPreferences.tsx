import { NSelect } from '../components/Select';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { contextDefaults, contextPermissions, type ContextPermissions } from '../../functions/ai/coach-context.js';
import './preferences.css';
import { modes } from './model';
export type CoachPreferencesValue = ContextPermissions & { mode: (typeof modes)[number]; version: number };
export function useCoachPreferences(uid: string) {
  const [value, setValue] = useState<CoachPreferencesValue>({ ...contextDefaults, mode: modes[0], version: 0 });
  const [ready,setReady] = useState(false);
  useEffect(() => onSnapshot(doc(db,'teachingCoach',uid,'settings','context'), snap => {
    const data = snap.data();
    setValue({ ...contextPermissions(data), mode: modes.includes(data?.mode) ? data!.mode : modes[0], version: data?.version ?? 0 });
    setReady(true);
  }, () => setReady(false)), [uid]);
  return { value, ready };
}
const sources: [keyof ContextPermissions,string,string][] = [
  ['profile','Professional profile','Training, experience, roles, learners and goals'],
  ['beliefs','Teaching beliefs','Your ideas and assumptions about teaching'],
  ['reflections','Reflections','Relevant excerpts from your reflective journal'],
  ['inquiries','Research inquiries','Relevant plans, observations and findings'],
];
export function CoachPreferences({ uid }: { uid: string }) {
  const { value, ready } = useCoachPreferences(uid);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  async function change(patch: Partial<CoachPreferencesValue>) {
    if (!ready || saving) return;
    setSaving(true); setError('');
    try {
      await runTransaction(db, async tx => {
        const ref=doc(db,'teachingCoach',uid,'settings','context'), old=await tx.get(ref), data=old.data();
        tx.set(ref,{...contextPermissions(data),mode:modes.includes(data?.mode)?data!.mode:modes[0],...patch,version:(data?.version??0)+1});
      });
    } catch { setError('We couldn’t save that setting. Check your connection and try again.'); }
    finally { setSaving(false); }
  }
  return <div className="coach-user-preferences"><h3>What your coach can use</h3><p>All four sources are available by default. Switch off any source below. Changes clear the current chat so previous context is no longer included.</p>{!ready && <p role="status">Opening coach settings…</p>}<div className="coach-preference-options">{sources.map(([key,label,detail]) => <label key={key}><input type="checkbox" checked={value[key]} disabled={!ready||saving} onChange={e=>void change({[key]:e.target.checked})}/><span><b>{label}</b><small>{detail}</small></span></label>)}</div><label className="coach-preference-style">Coaching style<NSelect aria-label="Coaching style" value={value.mode} disabled={!ready||saving} onChange={e=>void change({mode:e.target.value as CoachPreferencesValue['mode']})}>{modes.map(mode=><option key={mode}>{mode}</option>)}</NSelect></label>{error&&<p role="alert">{error}</p>}<p className="hint">Reading Journal text, lesson plans and learner records aren’t read automatically. Chats stay in the current window unless you save them to Reflections.</p><Link className="btn" to="/development?section=profile">Edit teaching profile and beliefs</Link></div>;
}

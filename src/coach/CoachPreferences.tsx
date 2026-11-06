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
  ['profile','Professional profile','Your training, experience, roles, learners and goals'],
  ['beliefs','Teaching beliefs','Your ideas about teaching'],
  ['reflections','Reflections','The parts of your reflective journal that fit the question'],
  ['lessons','Lessons in your classes','Activities from lessons in classes you teach'],
  ['games','Games in those lessons','Their questions, and scores without learners’ names'],
  ['forms','Forms in Collab','Development and language forms you can open'],
  ['inquiries','Research inquiries','Your plans, observations and findings'],
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
  return <div className="coach-user-preferences">
    <p className="hint coach-pref-intro">Choose what the Companion can read when it answers you. A change applies from your next message, and your saved chats stay.</p>
    {!ready && <p role="status" className="hint">Opening your Companion settings…</p>}
    <div className="coach-preference-options">
      {sources.map(([key,label,detail]) => <label key={key} className="set-row">
        <span className="set-row-t"><b>{label}</b><span className="hint">{detail}</span></span>
        <span className="set-row-c"><input type="checkbox" className="switch" checked={value[key]} disabled={!ready||saving} onChange={e=>void change({[key]:e.target.checked})}/></span>
      </label>)}
      <div className="set-row">
        <span className="set-row-t"><b>Coaching style</b><span className="hint">How the Companion talks with you</span></span>
        <span className="set-row-c"><NSelect className="set-select" aria-label="Coaching style" value={value.mode} disabled={!ready||saving} onChange={e=>void change({mode:e.target.value as CoachPreferencesValue['mode']})}>{modes.map(mode=><option key={mode}>{mode}</option>)}</NSelect></span>
      </div>
      <div className="set-row">
        <span className="set-row-t"><b>Your teaching profile</b><span className="hint">Your Reading Journal and learner records are only read when you bring them into a chat. Chats are saved privately in History.</span></span>
        <span className="set-row-c"><Link className="btn small-btn" to="/development?section=profile">Edit profile</Link></span>
      </div>
    </div>
    {error&&<p role="alert" className="error">{error}</p>}
  </div>;
}

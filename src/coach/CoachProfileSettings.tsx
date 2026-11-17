import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { NSelect } from '../components/Select';
import { AutoTextarea } from '../ai/AutoTextarea';
import { BeliefsForm } from './BeliefsForm';
import { Qualifications } from './Qualifications';
import { emptyProfile, type CoachProfile } from './model';
import './coach.css';

export function CoachProfileSettings({ uid }: { uid: string }) {
  const [saved, setSaved] = useState<CoachProfile>(emptyProfile);
  const [draft, setDraft] = useState<CoachProfile>(emptyProfile);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const needsOtherQualification = draft.qualifications.split(',').some(part => /^other:?\s*$/i.test(part.trim()));
  useEffect(() => onSnapshot(doc(db, 'teachingCoach', uid, 'settings', 'profile'), snap => {
    const next = { ...emptyProfile, ...snap.data() };
    setSaved(next);
    if (!dirtyRef.current) setDraft(next);
    setReady(true);
    setError('');
  }, () => { setError('We couldn’t load your teaching profile. Check your connection and try again.'); setReady(false); }), [uid]);
  const change = (next: CoachProfile) => { setDraft(next); setDirty(true); setNotice(''); };
  async function save() {
    if (!ready || busy || !dirty) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, 'teachingCoach', uid, 'settings', 'profile');
        const current = await tx.get(ref);
        if ((current.data()?.version ?? 0) !== saved.version) throw Error('Your profile changed in another window. Reopen Settings before saving.');
        tx.set(ref, { ...draft, version: saved.version + 1 });
      });
      setDirty(false); setNotice('Your teaching profile was saved.');
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith('Your profile changed') ? e.message : 'We couldn’t save your profile. Check your connection and try again. Your edits are still here.');
    } finally { setBusy(false); }
  }
  return <div className="coach-profile-settings" id="coach-profile-settings"><h3>Your teaching profile</h3><p className="hint">All fields are optional. Choose what Teacher’s Companion can use in the settings above.</p>
    {!ready && <p role="status">Opening your teaching profile…</p>}
    <fieldset disabled={!ready || busy}>
      <Qualifications value={draft.qualifications} onChange={qualifications => change({ ...draft, qualifications })} />
      <label>Years of teaching experience<NSelect aria-label="Years of teaching experience" value={draft.experience} onChange={e => change({ ...draft, experience: e.target.value })}><option value="">Prefer to add later</option>{['0–2', '3–5', '6–10', '10+'].map(v => <option key={v}>{v}</option>)}</NSelect></label>
      <label>Your learners and teaching context<AutoTextarea maxLength={6000} value={draft.context} onChange={e => change({ ...draft, context: e.target.value })} /></label>
      <label>Professional goals, specialisms and interests<AutoTextarea maxLength={6000} value={draft.goals} onChange={e => change({ ...draft, goals: e.target.value })} /></label>
      <fieldset><legend>Your roles</legend>{['Teacher', 'Teacher trainer', 'Academic manager'].map(role => <label className="coach-role" key={role}><input type="checkbox" checked={draft.roles.includes(role)} onChange={e => change({ ...draft, roles: e.target.checked ? [...draft.roles, role] : draft.roles.filter(v => v !== role) })} />{role}</label>)}</fieldset>
      <h3>Your teaching beliefs</h3><BeliefsForm value={draft.beliefs} onChange={beliefs => change({ ...draft, beliefs })} />
    </fieldset>
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {dirty && <p className="hint">You have unsaved profile changes.</p>}
    <div className="coach-actions"><button type="button" className="btn primary" disabled={!ready || !dirty || busy || needsOtherQualification} onClick={() => void save()}>Save teaching profile</button><button type="button" className="btn" disabled={!ready || busy} onClick={() => change({ ...emptyProfile, version: saved.version })}>Clear fields</button>{needsOtherQualification && <span role="status" className="hint">Name your other course or qualification to save.</span>}</div>
  </div>;
}

import { useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../lib/auth';

// Change the name colleagues and learners see. It changes the sign-in account and the ELT Suite
// profile; things already sent (messages, comments) keep the name they were sent with.
export function ChangeName({ name }: { name: string }) {
  const { user, setNameLocal } = useAuth();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [needsProfileSync, setNeedsProfileSync] = useState(false);
  if (!user) return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  const problem = !clean ? 'Write your name.' : clean.length > 60 ? 'Use 60 characters or fewer.' : '';
  const save = async () => {
    if (busy || problem || (clean === name && !needsProfileSync)) { if (clean === name && !needsProfileSync) setOpen(false); return; }
    setBusy(true); setMsg('');
    try {
      const account = auth.currentUser ?? user;
      if (account.displayName !== clean) await updateProfile(account, { displayName: clean });
      try {
        await updateDoc(doc(db, 'users', user.uid), { displayName: clean });
      } catch {
        setNeedsProfileSync(true);
        setMsg('Your sign-in name changed, but colleagues may still see your old name. Retry to finish updating your profile.');
        return;
      }
      setNeedsProfileSync(false);
      setNameLocal(clean);
      setOpen(false);
      setMsg('Your name is changed. Messages you sent before keep the old name.');
    } catch {
      setMsg('We couldn’t change your name just now. Check your connection and try again.');
    } finally { setBusy(false); }
  };
  if (!open) return (
    <>
      <button type="button" className="btn small-btn" onClick={() => { setValue(name); setOpen(true); setMsg(''); }}>Change name</button>
      {msg && <p className="hint set-name-msg" role="status">{msg}</p>}
    </>
  );
  return (
    <form className="set-name-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label className="sr-only" htmlFor="set-name-input">Your name</label>
      <input id="set-name-input" autoFocus value={value} maxLength={80} autoComplete="name" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} aria-describedby="set-name-help" />
      <button type="submit" className="btn small-btn primary" disabled={busy || !!problem}>{busy ? 'Saving…' : 'Save'}</button>
      <button type="button" className="btn small-btn" onClick={() => setOpen(false)}>Cancel</button>
      <span id="set-name-help" className="hint">{problem || 'This is the name colleagues and learners see.'}</span>
      {msg && <p role="alert" className="hint">{msg}</p>}
    </form>
  );
}

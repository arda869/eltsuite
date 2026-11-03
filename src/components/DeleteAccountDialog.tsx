import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';

export function DeleteAccountDialog({ onClose, target }: { onClose: () => void; target?: { uid: string; email: string } }) {
  const { user } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [err, setErr] = useState('');
  const self = !target || target.uid === user?.uid;
  async function go() {
    if (!user || busy || typed !== 'DELETE') return;
    setErr(''); setBusy(true);
    try {
      await httpsCallable(getFunctions(app, 'us-central1'), 'deleteAccount')({ uid: target?.uid || user.uid, confirmation: typed });
      setAccepted(true);
      if (self) await signOut(auth);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not request account deletion. Please try again.');
    } finally { setBusy(false); }
  }
  return <div className="scrim" onClick={() => !busy && onClose()}>
    <div className="dialog" role="dialog" aria-modal="true" aria-label="Delete account" onClick={e => e.stopPropagation()}>
      <h2 style={{ margin: 0 }}>{accepted ? 'Account deletion requested' : self ? 'Delete your account?' : 'Delete this account?'}</h2>
      {accepted ? <><p role="status">Deletion will continue securely in the background. You can close this window. The account, its owned classes, learner accounts and personal files are being removed.</p><button type="button" className="btn" onClick={onClose}>Close</button></> : <>
        <p><strong>{target?.email || user?.email}</strong></p>
        <p>This permanently removes the account, classes it owns, those classes’ learner accounts and work, and its personal files. Co-taught classes owned by someone else are kept. Messages and copies already shared with others may remain. This cannot be undone.</p>
        <p>Sign in again first if your last sign-in was more than five minutes ago. Site-owner accounts are protected; remove super-admin access and assign another organisation admin where needed before deleting.</p>
        <label className="field">Type DELETE to confirm<input value={typed} onChange={e => setTyped(e.target.value)} disabled={busy} autoFocus /></label>
        {typed !== 'DELETE' && <p className="hint">Enter DELETE exactly to enable account deletion.</p>}
        {busy && <p role="status">Requesting deletion…</p>}
        {err && <p role="alert" className="error">{err}</p>}
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="btn danger" disabled={typed !== 'DELETE' || busy} onClick={() => void go()}>Permanently delete account</button></span>
      </>}
    </div>
  </div>;
}

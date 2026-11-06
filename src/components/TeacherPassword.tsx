import { useState } from 'react';
import { updatePassword, reload, reauthenticateWithPopup, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { friendlyAuthError } from '../lib/authErrors';

/** Link a password to the existing identity; never create a second account. */
export function TeacherPassword({ user }: { user: User }) {
  const [linked, setLinked] = useState(() => user.providerData?.some(p => p.providerId === 'password'));
  const [open, setOpen] = useState(false), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [verify, setVerify] = useState(false), [error, setError] = useState('');
  if (!user.email || !user.providerData?.some(p => p.providerId === 'google.com')) return null;
  const problem = !password ? 'Enter a password with at least 8 characters.' : password.length < 8 ? 'Use at least 8 characters.' : !confirm ? 'Enter your password again to confirm it.' : confirm !== password ? 'The passwords don’t match.' : '';
  async function save() {
    if (busy || problem) return;
    setBusy(true); setError('');
    try {
      if (auth.currentUser?.uid !== user.uid) throw new Error('session changed');
      if (verify) await reauthenticateWithPopup(user, googleProvider);
      await updatePassword(user, password);
      await reload(user);
      setLinked(true); setPassword(''); setConfirm(''); setOpen(false); setVerify(false);
    } catch (e) {
      const code = (e as {code?: string}).code;
      if (code === 'auth/requires-recent-login') { setVerify(true); setError('Please confirm your Google account to finish adding your password.'); }
      else if (code === 'auth/provider-already-linked') { setLinked(true); setPassword(''); setConfirm(''); setOpen(false); }
      else if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') setError('This email is linked to another account. Your existing account has not changed.');
      else setError(friendlyAuthError(e) || 'Google confirmation was cancelled. Your password has not been added.');
    } finally { setBusy(false); }
  }
  return <div className="teacher-password">
    <div className="set-row"><span className="set-row-t"><b>Password sign-in</b><span className="hint">{linked ? `You can sign in with Google or your email and password: ${user.email}` : `Add a password for ${user.email}. Google sign-in, your classes and your files stay connected to this account.`}</span></span>{!linked && !open && <button type="button" className="btn small-btn" onClick={() => setOpen(true)}>Add password</button>}</div>
    {linked && <p role="status">Password sign-in is enabled.</p>}
    {open && <form className="teacher-password-form" onSubmit={e => {e.preventDefault(); void save();}}>
      <label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
      <label>Confirm password<input type="password" autoComplete="new-password" required value={confirm} disabled={busy} onChange={e => setConfirm(e.target.value)} /></label>
      <p id="teacher-password-help" className="hint">{problem || 'Your password will be added to this account.'}</p>
      {error && <p role="alert">{error}</p>}
      <div className="teacher-password-actions"><button className="btn primary" disabled={busy || !!problem} aria-describedby="teacher-password-help">{busy ? 'Saving…' : verify ? 'Confirm with Google and add password' : 'Save password'}</button><button type="button" className="btn" disabled={busy} onClick={() => {setOpen(false); setPassword(''); setConfirm(''); setError(''); setVerify(false);}}>Cancel</button></div>
    </form>}
  </div>;
}

import { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, reload, updatePassword, type User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { friendlyAuthError } from '../lib/authErrors';

// Your password. Google-only accounts can add one (it joins the same account; never a second one).
// Accounts with a password can change it after confirming the current one.
export function TeacherPassword({ user }: { user: User }) {
  const google = !!user.providerData?.some((p) => p.providerId === 'google.com');
  const [linked, setLinked] = useState(() => !!user.providerData?.some((p) => p.providerId === 'password'));
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [verify, setVerify] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  if (!user.email) return null;
  const changing = linked;
  const problem = changing && !current ? 'Enter your current password.' : !password ? 'Enter a new password with at least 8 characters.' : password.length < 8 ? 'Use at least 8 characters.' : changing && password === current ? 'Choose a password that’s different from your current one.' : !confirm ? 'Enter the new password again to confirm it.' : confirm !== password ? 'The new passwords don’t match.' : '';
  const reset = () => { setOpen(false); setCurrent(''); setPassword(''); setConfirm(''); setError(''); setVerify(false); };
  async function save() {
    if (busy || problem) return;
    setBusy(true); setError(''); setDone('');
    try {
      if (auth.currentUser?.uid !== user.uid) throw new Error('session changed');
      if (changing) await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, current));
      else if (verify) await reauthenticateWithPopup(user, googleProvider);
      await updatePassword(user, password);
      await reload(user);
      setDone(changing ? 'Your password is changed. Use the new one next time you sign in.' : 'Password added. You can now sign in with your email and password, or with Google.');
      setLinked(true); reset();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (changing && (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials')) setError('That isn’t your current password. Try again.');
      else if (code === 'auth/too-many-requests') setError('Too many tries. Wait a few minutes, then try again.');
      else if (code === 'auth/requires-recent-login') { setVerify(true); setError('Please confirm your Google account to finish adding your password.'); }
      else if (code === 'auth/provider-already-linked') { setLinked(true); reset(); }
      else if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') setError('This email is linked to another account. Your existing account has not changed.');
      else setError(friendlyAuthError(e) || (changing ? 'We couldn’t change your password just now. Try again.' : 'Google confirmation was cancelled. Your password has not been added.'));
    } finally { setBusy(false); }
  }
  return (
    <div className="teacher-password">
      <div className="set-row">
        <span className="set-row-t">
          <b>Password</b>
          <span className="hint">{linked ? `You sign in with ${user.email}${google ? ' and your password, or with Google' : ' and your password'}.` : google ? `You sign in with Google. Add a password to sign in with ${user.email} too. Your classes and files stay the same.` : `Add a password to sign in with ${user.email}.`}</span>
        </span>
        {!open && <span className="set-row-c"><button type="button" className="btn small-btn" onClick={() => { setOpen(true); setDone(''); }}>{linked ? 'Change password' : 'Add a password'}</button></span>}
      </div>
      {done && <p role="status" className="hint">{done}</p>}
      {open && (
        <form className="teacher-password-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {changing && <label>Current password<input type="password" autoComplete="current-password" required value={current} disabled={busy} onChange={(e) => setCurrent(e.target.value)} autoFocus /></label>}
          <label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} autoFocus={!changing} /></label>
          <label>New password again<input type="password" autoComplete="new-password" required value={confirm} disabled={busy} onChange={(e) => setConfirm(e.target.value)} /></label>
          <p id="teacher-password-help" className="hint">{problem || (changing ? 'Your new password replaces the old one on every device.' : 'Your password will be added to this account.')}</p>
          {error && <p role="alert">{error}</p>}
          <div className="teacher-password-actions">
            <button className="btn primary" disabled={busy || !!problem} aria-describedby="teacher-password-help">{busy ? 'Saving…' : changing ? 'Change password' : verify ? 'Confirm with Google and add password' : 'Add password'}</button>
            <button type="button" className="btn" disabled={busy} onClick={reset}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

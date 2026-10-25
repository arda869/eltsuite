import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { friendlyAuthError } from '../lib/authErrors';
import { Wordmark } from '../components/Wordmark';

function storedEmail() {
  try {
    return localStorage.getItem('emailForSignIn') ?? '';
  } catch {
    return '';
  }
}

export function EmailLinkFinish() {
  const navigate = useNavigate();
  const href = window.location.href;
  const valid = isSignInWithEmailLink(auth, href);
  const [email, setEmail] = useState(storedEmail());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function finish(address: string) {
    setBusy(true);
    setError('');
    try {
      await signInWithEmailLink(auth, address, href);
      try {
        localStorage.removeItem('emailForSignIn');
      } catch {
        /* ignore */
      }
      navigate('/', { replace: true });
    } catch (e) {
      setError(friendlyAuthError(e));
      setBusy(false);
    }
  }

  useEffect(() => {
    const saved = storedEmail();
    if (valid && saved) finish(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    finish(email.trim());
  };

  return (
    <div className="signin">
      <div className="intro">
        <Wordmark big />
      </div>
      <form className="card" onSubmit={submit}>
        <h1>{valid ? 'Finish signing in' : 'This link doesn’t work'}</h1>
        {valid && busy && !error ? (
          <span className="hint">Signing you in…</span>
        ) : valid ? (
          <>
            <span className="hint">You opened the link on a different device or browser. Confirm your email to continue.</span>
            <label className="field">
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            {error && <span className="error" role="alert">{error}</span>}
            <button className="btn primary tall block" disabled={busy || !email.trim()}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </>
        ) : (
          <button type="button" className="btn primary tall block" onClick={() => navigate('/')}>
            Back to sign-in
          </button>
        )}
      </form>
    </div>
  );
}

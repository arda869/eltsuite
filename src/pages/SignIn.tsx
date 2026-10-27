import type React from 'react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import { friendlyAuthError } from '../lib/authErrors';
import { Wordmark } from '../components/Wordmark';

type Mode = 'signin' | 'create' | 'reset' | 'link';

const GOOGLE = (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.1z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);

const TITLES: Record<Mode, string> = {
  signin: 'Teacher sign-in',
  create: 'Create a teacher account',
  reset: 'Reset your password',
  link: 'Sign in with an email link',
};

// intro: what shows beside the form, for example an organisation's invitation; start: the form filled in.
export function SignIn({ intro, start }: { intro?: React.ReactNode; start?: { mode?: Mode; name?: string; email?: string } } = {}) {
  const [mode, setMode] = useState<Mode>(start?.mode ?? 'signin');
  const [name, setName] = useState(start?.name ?? '');
  const [email, setEmail] = useState(start?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const go = (m: Mode) => {
    setMode(m);
    setError('');
    setNotice('');
  };

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  const google = () => run(async () => void (await signInWithPopup(auth, googleProvider)));

  function submit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (mode === 'signin') {
      run(async () => void (await signInWithEmailAndPassword(auth, address, password)));
    } else if (mode === 'create') {
      if (password.length < 8) return setError('Please use a password of at least 8 characters.');
      run(async () => {
        const cred = await createUserWithEmailAndPassword(auth, address, password);
        const displayName = name.trim();
        if (displayName) {
          await updateProfile(cred.user, { displayName });
          await setDoc(doc(db, 'users', cred.user.uid), { role: 'teacher', displayName, email: address }, { merge: true });
        }
      });
    } else if (mode === 'reset') {
      run(async () => {
        await sendPasswordResetEmail(auth, address);
        setNotice('If there is an account for this email, a reset link is on its way.');
      });
    } else {
      run(async () => {
        await sendSignInLinkToEmail(auth, address, {
          url: `${window.location.origin}/auth/link`,
          handleCodeInApp: true,
        });
        try {
          localStorage.setItem('emailForSignIn', address);
        } catch {
          /* private mode: the finish page will ask for the address again */
        }
        setNotice(`Check your inbox. We sent a sign-in link to ${address}.`);
      });
    }
  }

  const needsPassword = mode === 'signin' || mode === 'create';

  return (
    <div className="signin">
      {intro ?? (
        <div className="intro">
          <Wordmark big />
          <p>Plan your lessons, teach them live and see every answer as it arrives.</p>
          <div className="rule" />
          <span className="eyebrow">For teachers</span>
        </div>
      )}

      <form className="card" onSubmit={submit} noValidate>
        <h1>{TITLES[mode]}</h1>

        {(mode === 'signin' || mode === 'create') && (
          <>
            <button type="button" className="btn tall block" onClick={google} disabled={busy} style={{ fontWeight: 600 }}>
              {GOOGLE}
              Continue with Google
            </button>
            <div className="divider">or</div>
          </>
        )}

        {mode === 'create' && (
          <label className="field">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="How learners will see you" />
          </label>
        )}

        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>

        {needsPassword && (
          <label className="field">
            <span className="row-between">
              Password
              {mode === 'signin' && (
                <button type="button" className="btn link small" onClick={() => go('reset')}>
                  Forgot?
                </button>
              )}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              required
            />
            {mode === 'create' && <span className="hint">At least 8 characters.</span>}
          </label>
        )}

        {mode === 'link' && <span className="hint">We’ll email you a link that signs you in. No password needed.</span>}

        {error && <span className="error" role="alert">{error}</span>}
        {notice && <span className="notice" role="status">{notice}</span>}

        <button type="submit" className="btn primary tall block" disabled={busy || !email.trim() || (needsPassword && !password)}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'create' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Email me a link'}
        </button>

        {mode === 'signin' && (
          <button type="button" className="btn tall block" onClick={() => go('link')}>
            Email me a sign-in link instead
          </button>
        )}

        <div className="row-between small">
          {mode === 'signin' ? (
            <button type="button" className="btn link small" onClick={() => go('create')}>
              Create a teacher account
            </button>
          ) : (
            <button type="button" className="btn link small" onClick={() => go('signin')}>
              Back to sign-in
            </button>
          )}
          <Link to="/join" className="small">
            I am a learner
          </Link>
        </div>
        <span className="hint legal-links">
          <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link>
        </span>
      </form>
    </div>
  );
}

import type React from 'react';
import { useEffect, useState, type FormEvent } from 'react';
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
import { inviteFields, useAuth } from '../lib/auth';
import { cleanCode, codeProblem, keepCode, keepName, readCode, type InviteCode } from '../lib/codes';
import { Wordmark } from '../components/Wordmark';

type Mode = 'signin' | 'create' | 'reset' | 'link' | 'code';

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
  code: 'I have an invitation',
};

// The link in an invitation email: /?code=<the code> opens the form with the code filled in.
function codeInLink() {
  try {
    return new URLSearchParams(window.location.search).get('code')?.trim() ?? '';
  } catch {
    return '';
  }
}

// intro: what shows beside the form, for example an organisation's invitation; start: the form filled in.
export function SignIn({ intro, start }: { intro?: React.ReactNode; start?: { mode?: Mode; name?: string; email?: string } } = {}) {
  const { notInvited } = useAuth();
  const linked = start ? '' : codeInLink();
  const [mode, setMode] = useState<Mode>(start?.mode ?? (linked ? 'code' : 'signin'));
  const [name, setName] = useState(start?.name ?? '');
  const [email, setEmail] = useState(start?.email ?? '');
  const [typed, setTyped] = useState(linked);
  const [code, setCode] = useState<InviteCode | null>(null);
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

  // An invitation code: looked up, then the form to make the account, with what the code says.
  async function openInvitation(text: string) {
    await run(async () => {
      const c = await readCode(text);
      if (!c) return setError('That code was not found. Check it and try again: it looks like ABCD-EF23.');
      const problem = codeProblem(c);
      if (problem) return setError(problem + ' Ask whoever invited you for a new one.');
      keepCode(c.code);
      setCode(c);
      if (c.email) setEmail(c.email);
      if (c.name && !name) setName(c.name);
      setMode('create');
    });
  }
  useEffect(() => {
    if (linked) void openInvitation(linked);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (mode === 'code') {
      void openInvitation(typed);
    } else if (mode === 'signin') {
      run(async () => void (await signInWithEmailAndPassword(auth, address, password)));
    } else if (mode === 'create') {
      if (password.length < 8) return setError('Please use a password of at least 8 characters.');
      if (code) {
        const problem = codeProblem(code, address);
        if (problem) return setError(problem);
      }
      keepName(name);
      run(async () => {
        const cred = await createUserWithEmailAndPassword(auth, address, password);
        const displayName = name.trim();
        if (displayName) {
          // Without an invitation the profile is refused: the app then says so and takes the new
          // sign-in account back, so a failure here is not this form's error.
          try {
            await updateProfile(cred.user, { displayName });
            await setDoc(doc(db, 'users', cred.user.uid), { role: 'teacher', displayName, email: address, ...inviteFields() }, { merge: true });
          } catch {
            /* see above */
          }
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
          <span className="soon-badge">Coming soon</span>
          <p>Your whole job in one account.</p>
          <div className="rule" />
          <p className="soon-note">
            ELT Suite opens to every teacher soon. For now, <b>teachers join by invitation</b>. Learners join with the code their teacher gives them.
          </p>
          <Link className="btn si-tour" to="/tour">
            See what ELT Suite can do →
          </Link>
          <p className="si-ask">
            Questions? Email <a href="mailto:arda@eltsuite.com">arda@eltsuite.com</a>
          </p>
        </div>
      )}

      <form className="card" onSubmit={submit} noValidate>
        <h1>{TITLES[mode]}</h1>

        {notInvited && !error && (
          <span className="error" role="alert">
            {notInvited} has no account in ELT Suite yet, and there is no invitation for it. ELT Suite is open by invitation for now: if you have an invitation code, choose “I have an invitation”.
          </span>
        )}
        {mode === 'create' && code && (
          <span className="code-ok" role="status">
            <b>{code.orgName ? `An invitation from ${code.orgName}` : 'An invitation to ELT Suite'}</b>
            <span>
              Code {code.code}
              {code.email ? `, for ${code.email}` : ''}. Make your account with Google or a password.
            </span>
          </span>
        )}
        {mode === 'create' && !code && <span className="hint">Teachers join by invitation for now. Use the email your invitation was sent to.</span>}
        {mode === 'code' && (
          <label className="field">
            Invitation code
            <input className="code-in" value={typed} onChange={(e) => setTyped(e.target.value)} onBlur={() => setTyped((t) => cleanCode(t) || t)} placeholder="ABCD-EF23" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={24} autoFocus />
            <span className="hint">The code from your invitation email, or from the person who invited you.</span>
          </label>
        )}

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

        {mode !== 'code' && (
          <label className="field">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required readOnly={mode === 'create' && !!code?.email} />
          </label>
        )}

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

        <button type="submit" className="btn primary tall block" disabled={busy || (mode === 'code' ? cleanCode(typed).length < 8 : !email.trim() || (needsPassword && !password))}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'create' ? 'Create account' : mode === 'reset' ? 'Send reset link' : mode === 'code' ? 'Continue' : 'Email me a link'}
        </button>

        {mode === 'signin' && (
          <button type="button" className="btn tall block" onClick={() => go('link')}>
            Email me a sign-in link instead
          </button>
        )}

        {mode === 'signin' && !start && (
          <div className="invite-cta">
            <span>New to ELT Suite?</span>
            <button type="button" className="btn block tall invite-btn" onClick={() => go('code')}>
              I have an invitation
            </button>
          </div>
        )}

        <div className="row-between small">
          {mode === 'signin' ? (
            <span />
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

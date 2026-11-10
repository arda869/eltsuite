import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from '../lib/firebase';
import { learnerEmail, learnerPassword } from '../lib/learners';
import { Wordmark } from '../components/Wordmark';
import { UiIcon } from '../components/UiIcon';
import { live, mainOrigin } from '../lib/site';

const normalise = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]{3})(\d)/, '$1-$2').slice(0, 7);

function lastCode() {
  try {
    // A link from the teacher (/join?code=ABC-123) fills the code in.
    const q = new URLSearchParams(location.search).get('code');
    if (q) return normalise(q);
    return localStorage.getItem('lastClassCode') ?? '';
  } catch {
    return '';
  }
}

// The learners' home page (learn.eltsuite.com): join your class with its code and your PIN.
export function LearnerJoin({ home = false }: { home?: boolean }) {
  const [code, setCode] = useState(lastCode());
  const [name, setName] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const secret = usePassword ? password : pin.join('');
  const ready = usePassword ? password.length >= 8 : pin.join('').length === 4;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, '');
    if (d.length > 1) {
      const all = d.slice(0, 4).split('');
      setPin([0, 1, 2, 3].map((k) => all[k] ?? ''));
      pinRefs.current[Math.min(all.length, 3)]?.focus();
      return;
    }
    const next = [...pin];
    next[i] = d;
    setPin(next);
    if (d && i < 3) pinRefs.current[i + 1]?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[A-Z]{3}-\d{3}$/.test(code) || name.trim().length < 2 || !ready) return;
    setBusy(true);
    setError('');
    try {
      const resolved = await httpsCallable<{ code: string; name: string }, { learnerId: string }>(getFunctions(app, 'us-central1'), 'resolveLearnerSignIn')({ code, name: name.trim() });
      await signInWithEmailAndPassword(auth, learnerEmail(resolved.data.learnerId), learnerPassword(code, secret));
      try {
        localStorage.setItem('lastClassCode', code);
      } catch {
        /* ignore */
      }
    } catch (err) {
      const c = (err as { code?: string }).code ?? '';
      setError(
        c === 'functions/resource-exhausted' || c === 'auth/too-many-requests'
          ? 'Too many tries. Wait a minute, or ask your teacher for your PIN.'
          : c === 'auth/network-request-failed' || c === 'functions/unavailable'
            ? 'No connection. Check your internet and try again.'
            : c === 'functions/not-found'
              ? 'We couldn’t match that class code and name. Check with your teacher.'
            : usePassword
              ? 'That password doesn’t match. Try again.'
              : 'That PIN doesn’t match. Try again, or ask your teacher.',
      );
      setPin(['', '', '', '']);
      setPassword('');
      if (!usePassword) pinRefs.current[0]?.focus();
      setBusy(false);
    }
  }

  return (
    <div className="signin learner-entry">
      <div className="intro lj-intro">
        <Wordmark big />
        {home && <span className="lj-kicker">For learners</span>}
        <p>Enter the class code your teacher gave you, then follow the steps to join.</p>
        {home && (
          <ul className="lj-points">
            <li>
              <span className="lj-ico"><UiIcon name="sync" size={18} /></span>
              <span><b>Live lessons.</b> Your screen follows your teacher.</span>
            </li>
            <li>
              <span className="lj-ico"><UiIcon name="task" size={18} /></span>
              <span><b>Homework.</b> Do it here and see your answers.</span>
            </li>
            <li>
              <span className="lj-ico"><UiIcon name="message" size={18} /></span>
              <span><b>Messages and notes.</b> Everything from your class.</span>
            </li>
          </ul>
        )}
        <div className="rule" />
        <span className="eyebrow">No email needed</span>
      </div>

      <form className="card" onSubmit={submit}>
        <h1>Join your class</h1>
        <label className="field">
          Class code
          <input
            value={code}
            onChange={(e) => setCode(normalise(e.target.value))}
            placeholder="ABC-123"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            style={{ letterSpacing: '0.08em' }}
          />
        </label>

        {/^[A-Z]{3}-\d{3}$/.test(code) && (
          <label className="field">
            Your full name
            <input aria-label="Your full name" value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
          </label>
        )}

        {/^[A-Z]{3}-\d{3}$/.test(code) && name.trim().length >= 2 && usePassword && (
          <label className="field">
            Your password
            <input type="password" value={password} autoFocus autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        {/^[A-Z]{3}-\d{3}$/.test(code) && name.trim().length >= 2 && (
          <button type="button" className="btn link small" style={{ alignSelf: 'flex-start' }} onClick={() => (setUsePassword((v) => !v), setError(''))}>
            {usePassword ? 'Use my PIN instead' : 'I use a password'}
          </button>
        )}
        {/^[A-Z]{3}-\d{3}$/.test(code) && name.trim().length >= 2 && !usePassword && (
          <fieldset className="pin-field">
            <legend>PIN</legend>
            <div className="pin-boxes">
              {pin.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (pinRefs.current[i] = el)}
                  aria-label={`PIN digit ${i + 1}`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && pinRefs.current[i - 1]?.focus()}
                  maxLength={4}
                />
              ))}
            </div>
          </fieldset>
        )}

        {error && <span className="error" role="alert">{error}</span>}

        {!busy && (!/^[A-Z]{3}-\d{3}$/.test(code) || name.trim().length < 2 || !ready) && <span className="hint">Enter your class code, full name and {usePassword ? 'password' : 'four-digit PIN'} to join.</span>}
        <button className="btn primary tall block" disabled={busy || !/^[A-Z]{3}-\d{3}$/.test(code) || name.trim().length < 2 || !ready}>
          {busy ? 'Joining…' : 'Join class'}
        </button>
        <div className="row-between small">
          <span className="hint">Forgot your PIN? Ask your teacher (unless you chose your own).</span>
          {live() ? <a href={mainOrigin()}>I’m a teacher</a> : <Link to="/?site=main">I’m a teacher</Link>}
        </div>
      </form>
    </div>
  );
}

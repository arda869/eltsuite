import { NSelect } from '../components/Select';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { learnerEmail, learnerPassword } from '../lib/learners';
import { Wordmark } from '../components/Wordmark';
import { UiIcon } from '../components/UiIcon';
import { live, mainOrigin } from '../lib/site';

type Found = { code: string; className: string; roster: { id: string; name: string }[] };

const normalise = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]{3})(\d)/, '$1-$2').slice(0, 7);

function lastCode() {
  try {
    // A link from the teacher (learn.eltsuite.com/?code=ABC-123) fills the code in.
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
  const [found, setFound] = useState<Found | null>(null);
  const [learnerId, setLearnerId] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const secret = usePassword ? password : pin.join('');
  const ready = usePassword ? password.length >= 8 : pin.join('').length === 4;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  async function lookUp(value: string) {
    setFound(null);
    setError('');
    if (!/^[A-Z]{3}-\d{3}$/.test(value)) return;
    try {
      const s = await getDoc(doc(db, 'classCodes', value));
      if (!s.exists()) return setError('We can’t find that class code. Check it with your teacher.');
      const d = s.data() as { className: string; roster?: Found['roster'] };
      const roster = [...(d.roster ?? [])].sort((a, b) => a.name.localeCompare(b.name));
      setFound({ code: value, className: d.className, roster });
      setLearnerId((id) => (roster.some((r) => r.id === id) ? id : ''));
    } catch {
      setError('No connection. Check your internet and try again.');
    }
  }

  useEffect(() => {
    lookUp(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

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
    if (!found || !learnerId || !ready) return;
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, learnerEmail(learnerId), learnerPassword(found.code, secret));
      try {
        localStorage.setItem('lastClassCode', found.code);
      } catch {
        /* ignore */
      }
    } catch (err) {
      const c = (err as { code?: string }).code ?? '';
      setError(
        c === 'auth/too-many-requests'
          ? 'Too many tries. Wait a minute, or ask your teacher for your PIN.'
          : c === 'auth/network-request-failed'
            ? 'No connection. Check your internet and try again.'
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
    <div className="signin">
      <div className="intro lj-intro">
        <Wordmark big />
        {home && <span className="lj-kicker">For learners</span>}
        <p>Your English class, in one place. Join with the code and PIN your teacher gave you.</p>
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
          {found && <span className="notice small">{found.className}</span>}
        </label>

        {found && (
          <label className="field">
            Your name
            <NSelect value={learnerId} onChange={(e) => setLearnerId(e.target.value)}>
              <option value="">Choose your name</option>
              {found.roster.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NSelect>
            {found.roster.length === 0 && <span className="hint">Your teacher hasn’t added learners to this class yet.</span>}
          </label>
        )}

        {found && learnerId && usePassword && (
          <label className="field">
            Your password
            <input type="password" value={password} autoFocus autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        {found && learnerId && (
          <button type="button" className="btn link small" style={{ alignSelf: 'flex-start' }} onClick={() => (setUsePassword((v) => !v), setError(''))}>
            {usePassword ? 'Use my PIN instead' : 'I use a password'}
          </button>
        )}
        {found && learnerId && !usePassword && (
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

        <button className="btn primary tall block" disabled={busy || !found || !learnerId || !ready}>
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

import { useState } from 'react';
import { changeMySecret } from '../lib/learners';

// A learner changes their PIN or sets a longer password. The teacher will not see the new one.
export function MySecretDialog({ classId, classCode, learnerId, onClose }: { classId: string; classCode: string; learnerId: string; onClose: () => void }) {
  const [kind, setKind] = useState<'pin' | 'password'>('pin');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const ok = (kind === 'pin' ? /^\d{4}$/.test(next) : next.length >= 8) && next === again && current;
  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await changeMySecret({ classId, classCode, learnerId, current, next, kind });
      setDone(true);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Change how I sign in" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Change how I sign in</h2>
        {done ? (
          <>
            <p className="notice">Done. Next time, sign in with your new {kind === 'pin' ? 'PIN' : 'password'}{kind === 'password' ? ' (choose “I use a password”)' : ''}.</p>
            <button type="button" className="btn primary" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <span className="seg small-seg" role="radiogroup" aria-label="PIN or password">
              <button type="button" role="radio" aria-checked={kind === 'pin'} className={kind === 'pin' ? 'on' : ''} onClick={() => (setKind('pin'), setNext(''), setAgain(''))}>
                New PIN
              </button>
              <button type="button" role="radio" aria-checked={kind === 'password'} className={kind === 'password' ? 'on' : ''} onClick={() => (setKind('password'), setNext(''), setAgain(''))}>
                Long password
              </button>
            </span>
            <label className="field">
              Your current PIN or password
              <input type="password" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
            </label>
            <label className="field">
              {kind === 'pin' ? 'New PIN (4 numbers)' : 'New password (at least 8 characters)'}
              <input type="password" inputMode={kind === 'pin' ? 'numeric' : undefined} maxLength={kind === 'pin' ? 4 : 100} value={next} autoComplete="new-password" onChange={(e) => setNext(kind === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value)} />
            </label>
            <label className="field">
              Type it again
              <input type="password" inputMode={kind === 'pin' ? 'numeric' : undefined} maxLength={kind === 'pin' ? 4 : 100} value={again} autoComplete="new-password" onChange={(e) => setAgain(kind === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value)} />
              {again && next !== again && <span className="error">They don’t match.</span>}
            </label>
            <span className="hint">Your teacher can’t see it or reset it for you, so choose something you’ll remember.</span>
            {msg && <span className="error">{msg}</span>}
            <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn primary" disabled={!ok || busy} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

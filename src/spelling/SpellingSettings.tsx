import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { NSelect } from '../components/Select';
import { VARIANTS, spellingDefaults, type Spelling } from './model';

// Your own spelling: the English you write in, spell check, and typo fixes as you type.
export function SpellingSettings({ uid, learner = false }: { uid: string; learner?: boolean }) {
  const [value, setValue] = useState<Spelling>(spellingDefaults);
  const [status, setStatus] = useState('');
  useEffect(() => onSnapshot(doc(db, 'users', uid), (s) => setValue(s.get('spelling') ?? spellingDefaults)), [uid]);
  const v = { ...spellingDefaults, ...value };
  const save = (next: Spelling) => {
    setValue(next);
    setStatus('Saving…');
    void updateDoc(doc(db, 'users', uid), { spelling: next })
      .then(() => setStatus('Saved'))
      .catch(() => setStatus('We couldn’t save that. Check your connection and try again.'));
  };
  return (
    <>
      <div className="set-row">
        <span className="set-row-t">
          <b>English</b>
          <span className="hint">The spelling we check your writing against</span>
        </span>
        <span className="set-row-c">
          <NSelect className="set-select" aria-label="English variant" value={v.variant} onChange={(e) => save({ ...value, variant: e.target.value as Spelling['variant'] })}>
            {Object.entries(VARIANTS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NSelect>
        </span>
      </div>
      <label className="set-row">
        <span className="set-row-t">
          <b>Spell check</b>
          <span className="hint">Underlines words that may be wrong. Use the Spelling button while you write for suggestions.</span>
        </span>
        <span className="set-row-c">
          <input type="checkbox" className="switch" checked={v.enabled} onChange={(e) => save({ ...value, enabled: e.target.checked })} />
        </span>
      </label>
      <label className="set-row">
        <span className="set-row-t">
          <b>Fix common typos as you type</b>
          <span className="hint">{v.enabled ? 'For example “teh” becomes “the”. Press Backspace to undo one.' : 'Turn on spell check to use this'}</span>
        </span>
        <span className="set-row-c">
          <input type="checkbox" className="switch" checked={v.enabled && v.autocorrect} disabled={!v.enabled} onChange={(e) => save({ ...value, autocorrect: e.target.checked })} />
        </span>
      </label>
      {!learner && <p className="hint set-foot-note">Each class has its own spelling settings for learners’ answers, in Class settings.</p>}
      <p role="status" className="sr-only">{status}</p>
    </>
  );
}

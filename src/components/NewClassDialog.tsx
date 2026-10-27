import { classDefaults, currentOrg, isTrainerIn } from '../lib/admin';
import { LevelPicker } from './LevelPicker';
import { useEffect, useState, type FormEvent } from 'react';
import { createClass, TRAINING_ADDS, type ClassKind } from '../lib/classes';
import { THEMES, type ThemeKey } from '../lib/themes';

export function NewClassDialog({ teacherId, onClose, onCreated }: { teacherId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('B1');
  const [themeColor, setThemeColor] = useState<ThemeKey>('flame');
  // In an organisation where admins make the classes, a teacher trainer still makes training classes.
  const onlyTraining = currentOrg()?.policy?.createClasses === false && isTrainerIn(currentOrg(), teacherId);
  const [kind, setKind] = useState<ClassKind>(onlyTraining ? 'training' : 'language');
  const [course, setCourse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [busy, onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const org = currentOrg();
      const pol = org?.policy;
      const id = await createClass(teacherId, { name: name.trim(), level: kind === 'training' ? course.trim() || 'Teacher training' : level, themeColor, kind, org: org?.id, extra: classDefaults(pol) });
      onCreated(id);
    } catch (err) {
      console.error(err);
      setError('The class could not be created. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-class-title" onSubmit={submit}>
        <h2 id="new-class-title">New class</h2>
        <label className="field">
          Class name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="For example: B1 Evening Group" />
        </label>
        {onlyTraining ? <span className="hint">As a teacher trainer, you create teacher training classes. {currentOrg()?.name} creates the language classes.</span> : <ClassKindPicker kind={kind} onChange={setKind} />}
        {kind === 'language' ? (
          <LevelPicker value={level} onChange={setLevel} />
        ) : (
          <label className="field">
            Course
            <input value={course} onChange={(e) => setCourse(e.target.value)} list="tt-courses" placeholder="For example: CELTA, Delta Module 2, in-service training" />
            <datalist id="tt-courses">
              {['CELTA', 'CertTESOL', 'Delta Module 1', 'Delta Module 2', 'Delta Module 3', 'DipTESOL', 'TKT', 'In-service training', 'MA TESOL'].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        )}
        <div className="field">
          Theme colour
          <div className="swatches" role="radiogroup" aria-label="Theme colour">
            {THEMES.map((t) => (
              <button
                type="button"
                key={t.key}
                role="radio"
                aria-checked={themeColor === t.key}
                className="swatch"
                onClick={() => setThemeColor(t.key)}
              >
                <span className="dot" style={{ background: t.accent }} />
                {t.name}
              </button>
            ))}
          </div>
          <span className="hint">Used across this class on your screens and your learners’ screens.</span>
        </div>
        {error && <span className="error" role="alert">{error}</span>}
        <div className="row-between" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create class'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ClassKindPicker({ kind, onChange }: { kind: ClassKind; onChange: (k: ClassKind) => void }) {
  return (
    <div className="field">
      <span>What kind of class</span>
      <div className="ck" role="radiogroup" aria-label="What kind of class">
        <button type="button" role="radio" aria-checked={kind === 'language'} className={'ck-o' + (kind === 'language' ? ' on' : '')} onClick={() => onChange('language')}>
          <b>A language class</b>
          <span className="hint">Learners of English: lessons, tasks, live teaching, messages.</span>
        </button>
        <button type="button" role="radio" aria-checked={kind === 'training'} className={'ck-o' + (kind === 'training' ? ' on' : '')} onClick={() => onChange('training')}>
          <b>Teacher training</b>
          <span className="hint">Everything in a language class, and tools for training teachers.</span>
        </button>
      </div>
      {kind === 'training' && (
        <ul className="ck-adds">
          {TRAINING_ADDS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <span className="hint">You can change this later in class settings.</span>
    </div>
  );
}

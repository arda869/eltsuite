import { LessonStylePicker } from './LessonStylePicker';
import { type LessonStyle } from '../lib/lessonStyle';
import { TrainingProfileFields, profileFromClass, defaultTrainingProfile } from '../training/TrainingProfileFields';
import { ClassProfileFields, defaultProfile } from '../ai/ClassProfileFields';
import { classDefaults, currentOrg, isTrainerIn } from '../lib/admin';
import { LimitError } from '../lib/limitError';
import { LevelPicker } from './LevelPicker';
import { useEffect, useState, type FormEvent } from 'react';
import { createClass, TRAINING_ADDS, type ClassKind } from '../lib/classes';
import { THEMES, type ThemeKey } from '../lib/themes';

export function NewClassDialog({ teacherId, onClose, onCreated }: { teacherId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [trainingProfile,setTrainingProfile]=useState(defaultTrainingProfile);
  const [learningProfile,setLearningProfile]=useState(defaultProfile);
  const [name, setName] = useState('');
  const [level, setLevel] = useState('B1');
  const [lessonStyle, setLessonStyle] = useState<LessonStyle>('adult');
  const [themeColor, setThemeColor] = useState<ThemeKey>('flame');
  // In an organisation where admins make the classes, a teacher trainer still makes training classes.
  const onlyTraining = currentOrg()?.policy?.createClasses === false && isTrainerIn(currentOrg(), teacherId);
  const [kind, setKind] = useState<ClassKind>(onlyTraining ? 'training' : 'language');
  const [course, setCourse] = useState('CELTA');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
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
      const id = await createClass(teacherId, { name: name.trim(), level: kind === 'training' ? course.trim() || 'Teacher training' : level, themeColor, lessonStyle, kind, org: org?.id, extra: { ...classDefaults(pol), ...(kind==='language'?{learningProfile}:{trainingProfile}), ...(start || end ? { dates: { start: start || null, end: end || null } } : {}) } });
      onCreated(id);
    } catch (err) {
      console.error(err);
      setError(err instanceof LimitError ? err.message : 'We couldn’t make the class. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="dialog" style={{ maxHeight: '80dvh', overflowY: 'auto' }} role="dialog" aria-modal="true" aria-labelledby="new-class-title" onSubmit={submit}>
        <h2 id="new-class-title">New class</h2>
        <label className="field">
          Class name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="For example: B1 Evening Group" />
        </label>
        {onlyTraining ? <span className="hint">As a teacher trainer, you make teacher training classes. {currentOrg()?.name} makes the language classes.</span> : <ClassKindPicker kind={kind} onChange={setKind} uid={teacherId} />}
        {kind === 'language' ? (
          <LevelPicker value={level} onChange={setLevel} />
        ) : (
          <label className="field">
            Course
            <input value={course} onChange={(e) => {setCourse(e.target.value);setTrainingProfile(profileFromClass(null,e.target.value));}} list="tt-courses" placeholder="For example: CELTA, Delta Module 2, in-service training" />
            <datalist id="tt-courses">
              {['CELTA', 'CertTESOL', 'Delta Module 1', 'Delta Module 2', 'Delta Module 3', 'DipTESOL', 'TKT', 'In-service training', 'MA TESOL'].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        )}
<details open={kind==='training'}><summary>{kind==='training'?'Training profile':'Learning profile'}</summary>{kind==='training'?<TrainingProfileFields value={trainingProfile} onChange={v=>{setTrainingProfile(v);setCourse(v.programme);}}/>:<ClassProfileFields value={learningProfile} onChange={setLearningProfile}/>}</details>
        <ClassDatesFields start={start} end={end} setStart={setStart} setEnd={setEnd} />
        <LessonStylePicker value={lessonStyle} onChange={setLessonStyle} />
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
            {busy ? 'Making…' : 'Make class'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Teacher training classes are for teacher trainers in an organisation that has them switched on.
export function trainingBlock(uid?: string): string {
  const org = currentOrg();
  if (!org) return 'Teacher training classes are made in an organisation. Join an organisation that has teacher training to make one.';
  if (!org.allow?.trainers) return `${org.name} doesn’t have teacher training classes.`;
  if (!isTrainerIn(org, uid)) return `Ask an admin in ${org.name} to make you a teacher trainer.`;
  return '';
}
// The course's first and last day, both optional.
export function ClassDatesFields({ start, end, setStart, setEnd }: { start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void }) {
  return (
    <div className="field cdates">
      <span>Course dates</span>
      <span className="cdates-row">
        <label>
          <span className="hint">Starts</span>
          <input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />
        </label>
        <span aria-hidden="true">–</span>
        <label>
          <span className="hint">Finishes</span>
          <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </span>
      <span className="hint">Optional. They show on the class, and on the home page while the course runs.</span>
    </div>
  );
}

export function ClassKindPicker({ kind, onChange, uid }: { kind: ClassKind; onChange: (k: ClassKind) => void; uid?: string }) {
  // A class that is already a training class can stay one.
  const blocked = kind === 'training' ? '' : trainingBlock(uid);
  return (
    <div className="field">
      <span>What kind of class</span>
      <div className="ck" role="radiogroup" aria-label="What kind of class">
        <button type="button" role="radio" aria-checked={kind === 'language'} className={'ck-o' + (kind === 'language' ? ' on' : '')} onClick={() => onChange('language')}>
          <b>A language class</b>
          <span className="hint">Learners of English: lessons, tasks, live teaching, messages.</span>
        </button>
        <button type="button" role="radio" aria-checked={kind === 'training'} aria-disabled={!!blocked || undefined} className={'ck-o' + (kind === 'training' ? ' on' : '') + (blocked ? ' blocked' : '')} onClick={() => !blocked && onChange('training')}>
          <b>
            Teacher training {blocked && <span className="ck-lock">For organisations</span>}
          </b>
          <span className="hint">{blocked || 'Everything in a language class, and tools for training teachers.'}</span>
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

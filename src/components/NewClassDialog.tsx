import { useEffect, useState, type FormEvent } from 'react';
import { createClass, LEVELS } from '../lib/classes';
import { THEMES, type ThemeKey } from '../lib/themes';

export function NewClassDialog({ teacherId, onClose, onCreated }: { teacherId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('B1');
  const [themeColor, setThemeColor] = useState<ThemeKey>('flame');
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
      const id = await createClass(teacherId, { name: name.trim(), level, themeColor });
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
        <div className="two">
          <label className="field">
            Level
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <span />
        </div>
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

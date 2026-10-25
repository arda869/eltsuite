import { useEffect, useState, type FormEvent } from 'react';
import { LEVELS, updateClass, type ClassDoc, type Meeting } from '../lib/classes';
import { THEMES, type ThemeKey } from '../lib/themes';

export function meetingProvider(url: string) {
  const u = url.toLowerCase();
  if (u.includes('zoom.us')) return 'Zoom';
  if (u.includes('meet.google.com')) return 'Meet';
  if (u.includes('teams.microsoft.com') || u.includes('teams.live.com')) return 'Teams';
  return 'Link';
}

export function ClassSettingsDialog({ c, onClose }: { c: ClassDoc; onClose: () => void }) {
  const [name, setName] = useState(c.name);
  const [level, setLevel] = useState(c.level);
  const [themeColor, setThemeColor] = useState<ThemeKey>(c.themeColor);
  const [url, setUrl] = useState(c.meeting?.url ?? '');
  const [meetingId, setMeetingId] = useState(c.meeting?.meetingId ?? '');
  const [passcode, setPasscode] = useState(c.meeting?.passcode ?? '');
  const [visibility, setVisibility] = useState<Meeting['visibility']>(c.meeting?.visibility ?? 'live');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [busy, onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const link = url.trim();
    if (link && !/^https:\/\/[^\s]+\.[^\s]+/i.test(link)) return setError('The meeting link should start with https://');
    setBusy(true);
    setError('');
    try {
      await updateClass(c, {
        name: name.trim() || c.name,
        level,
        themeColor,
        meeting: link ? { url: link, meetingId: meetingId.trim(), passcode: passcode.trim(), visibility } : null,
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError('Your changes could not be saved. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="cs-title" onSubmit={submit}>
        <h2 id="cs-title">Class settings</h2>

        <label className="field">
          Class name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="field" style={{ maxWidth: 200 }}>
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>

        <div className="field">
          Theme colour
          <div className="swatches" role="radiogroup" aria-label="Theme colour">
            {THEMES.map((t) => (
              <button type="button" key={t.key} role="radio" aria-checked={themeColor === t.key} className="swatch" onClick={() => setThemeColor(t.key)}>
                <span className="dot" style={{ background: t.accent }} />
                {t.name}
              </button>
            ))}
          </div>
          <span className="hint">Green and red stay reserved for right and wrong answers.</span>
        </div>

        <div className="field">
          <span>Online meeting</span>
          <span className="hint">Zoom, Google Meet, Microsoft Teams or any other link. Learners get a Join call button.</span>
          <span style={{ position: 'relative', display: 'block' }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" style={{ width: '100%', paddingRight: 70 }} aria-label="Meeting link" />
            {url.trim() && <span className="provider">{meetingProvider(url).toUpperCase()}</span>}
          </span>
        </div>
        {url.trim() && (
          <>
            <div className="two">
              <label className="field">
                <span>
                  Meeting ID <span className="hint">(optional)</span>
                </span>
                <input value={meetingId} onChange={(e) => setMeetingId(e.target.value)} />
              </label>
              <label className="field">
                <span>
                  Passcode <span className="hint">(optional)</span>
                </span>
                <input value={passcode} onChange={(e) => setPasscode(e.target.value)} />
              </label>
            </div>
            <label className="field">
              Learners see the link
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as Meeting['visibility'])}>
                <option value="live">Only while a lesson is live</option>
                <option value="before15">From 15 minutes before the lesson</option>
                <option value="always">Always</option>
              </select>
            </label>
          </>
        )}

        {error && <span className="error" role="alert">{error}</span>}
        <div className="row-between" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

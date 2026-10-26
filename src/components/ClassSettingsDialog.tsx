import { useEffect, useState, type FormEvent } from 'react';
import { LevelPicker } from './LevelPicker';
import { DEFAULT_CODES } from '../lib/annotations';
import { updateClass, type ClassDoc, type Meeting } from '../lib/classes';
import { THEMES, type ThemeKey } from '../lib/themes';
import { TeachersPanel } from './TeachersPanel';
import { CoverPicker } from './Covers';

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
  const [codes, setCodes] = useState(c.codes ?? DEFAULT_CODES);
  const [cover, setCover] = useState<string>(c.cover ?? 'preset:waves');
  const [showMarker, setShowMarker] = useState(c.teaching?.showMarker !== false);
  const [seeLearners, setSeeLearners] = useState(c.teaching?.seeLearners !== false);
  const [learnerElements, setLearnerElements] = useState(c.messaging?.learnerElements !== false);
  const [showCodes, setShowCodes] = useState(false);
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
        cover,
        teaching: { showMarker, seeLearners },
        messaging: { learnerElements },
        meeting: link ? { url: link, meetingId: meetingId.trim(), passcode: passcode.trim(), visibility } : null,
        codes: codes.filter((x) => x.code.trim()).map((x) => ({ code: x.code.trim().slice(0, 6), meaning: x.meaning.trim().slice(0, 60) })),
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
        <LevelPicker value={level} onChange={setLevel} />

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
        <div style={{ ['--accent' as string]: THEMES.find((t) => t.key === themeColor)?.accent }}>
          <CoverPicker classId={c.id} value={cover} onChange={setCover} />
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

        <div className="field">
          <span>While teaching</span>
          <label className="switch-row">
            <span>
              Show learners where I am
              <span className="hint">Learners see which task you are on</span>
            </span>
            <input type="checkbox" checked={showMarker} onChange={() => setShowMarker((v) => !v)} />
          </label>
          <label className="switch-row">
            <span>
              Show me where learners are
              <span className="hint">See which task each learner is on</span>
            </span>
            <input type="checkbox" checked={seeLearners} onChange={() => setSeeLearners((v) => !v)} />
          </label>
          <label className="switch-row">
            <span>
              Learners can send task elements in messages
              <span className="hint">Questions, vocabulary boxes and other elements from + Add. When off, learners send text and pictures.</span>
            </span>
            <input type="checkbox" checked={learnerElements} onChange={() => setLearnerElements((v) => !v)} />
          </label>
        </div>
        <TeachersPanel c={c} />
        {error && <span className="error" role="alert">{error}</span>}
        <div className="field">
          <span className="row-between">
            Correction codes for writing
            <button type="button" className="btn link small" onClick={() => setShowCodes((v) => !v)}>
              {showCodes ? 'Hide' : 'Edit'}
            </button>
          </span>
          {!showCodes ? (
            <span className="hint">{codes.map((x) => x.code).join(' · ')}</span>
          ) : (
            <span className="codes-edit">
              {codes.map((x, i) => (
                <span key={i} className="code-row">
                  <input value={x.code} maxLength={6} aria-label="Code" onChange={(e) => setCodes(codes.map((y, k) => (k === i ? { ...y, code: e.target.value } : y)))} />
                  <input value={x.meaning} maxLength={60} aria-label="Meaning" onChange={(e) => setCodes(codes.map((y, k) => (k === i ? { ...y, meaning: e.target.value } : y)))} />
                  <button type="button" className="icon-btn" aria-label="Remove code" onClick={() => setCodes(codes.filter((_, k) => k !== i))}>
                    ×
                  </button>
                </span>
              ))}
              <span style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn link small" onClick={() => setCodes([...codes, { code: '', meaning: '' }])}>
                  + Add a code
                </button>
                <button type="button" className="btn link small" onClick={() => setCodes(DEFAULT_CODES)}>
                  Use the standard codes
                </button>
              </span>
            </span>
          )}
        </div>
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

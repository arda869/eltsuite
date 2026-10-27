import { NSelect } from './Select';
import { emailChoicesOf, nameChoicesOf, useMyOrg } from '../lib/admin';
import { tr } from '../lib/terms';
import { useEffect, useState, type FormEvent } from 'react';
import { LevelPicker } from './LevelPicker';
import { DEFAULT_CODES } from '../lib/annotations';
import { updateClass, type ClassDoc, type Meeting, type MessagingMode, type NameShow } from '../lib/classes';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { THEMES, type ThemeKey } from '../lib/themes';
import { TeachersPanel } from './TeachersPanel';
import { CoverPicker } from './Covers';
import { ClassDatesFields, ClassKindPicker } from './NewClassDialog';
import { auth } from '../lib/firebase';
import { LEARNER_WORDS, TEACHER_WORDS, termsOf, type Terms } from '../lib/terms';
import { LEARNER_TOOLS, learnerToolOn } from '../lib/toolbarPrefs';
import { LIVE_AUDIO, type LiveAudioMode } from '../lib/liveAudio';

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
  const [start, setStart] = useState(c.dates?.start ?? '');
  const [end, setEnd] = useState(c.dates?.end ?? '');
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
  const [msgMode, setMsgMode] = useState<MessagingMode>(c.messaging?.mode ?? 'free');
  const [photos, setPhotos] = useState(c.profile?.photos === true);
  const org = useMyOrg();
  // What the organisation lets its teachers choose from.
  const nameOk = nameChoicesOf(org?.policy);
  const emailOk = emailChoicesOf(org?.policy);
  const orgNames = org && nameOk.length < 4;
  const orgEmail = org && emailOk.length < 3;
  const [names, setNames] = useState<NameShow>(c.profile?.names && nameOk.includes(c.profile.names) ? c.profile.names : nameOk.includes('full') ? 'full' : nameOk[0]);
  const [nicks, setNicks] = useState<Record<string, string>>(c.nicknames ?? {});
  const [emailLink, setEmailLink] = useState<'off' | 'optional' | 'required'>(c.accounts?.email && emailOk.includes(c.accounts.email) ? c.accounts.email : emailOk.includes('optional') ? 'optional' : emailOk[0]);
  const [tools, setTools] = useState<Record<string, boolean>>(() => Object.fromEntries(LEARNER_TOOLS.map((t) => [t.k, learnerToolOn(t.k, c.learnerTools)])));
  const [showTools, setShowTools] = useState(false);
  const [kind, setKind] = useState<'language' | 'training'>(c.kind ?? 'language');
  const [terms, setTerms] = useState<Terms>(() => termsOf(c));
  const [liveAudio, setLiveAudio] = useState<LiveAudioMode>(c.liveAudio ?? 'self');
  const [learners, setLearners] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    if (names !== 'nick' || learners) return;
    getDocs(collection(db, 'classes', c.id, 'learners'))
      .then((s) => setLearners(s.docs.map((d) => ({ id: d.id, name: String(d.data().displayName ?? '') })).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setLearners([]));
  }, [names, learners, c.id]);
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
        dates: { start: start || null, end: end || null },
        themeColor,
        cover,
        teaching: { showMarker, seeLearners },
        messaging: { learnerElements, mode: msgMode },
        profile: { photos, names },
        nicknames: Object.fromEntries(Object.entries(nicks).map(([k, v]) => [k, v.trim().slice(0, 30)]).filter(([, v]) => v)),
        accounts: { email: emailLink },
        learnerTools: tools,
        liveAudio,
        kind,
        terms,
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
        <ClassKindPicker kind={kind} onChange={setKind} uid={auth.currentUser?.uid} />
        <ClassDatesFields start={start} end={end} setStart={setStart} setEnd={setEnd} />
        {c.kind === 'training' && kind === 'language' && (
          <span className="error" role="alert">
            As a language class, the teacher training tools are hidden: language analysis cards, lesson plans, observation forms, video comments and loop input notes no longer show in lessons. They come back if you change it back.
          </span>
        )}
        {kind === 'language' ? (
          <LevelPicker value={level} onChange={setLevel} />
        ) : (
          <label className="field">
            Course
            <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="For example: CELTA" />
          </label>
        )}

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
          <span className="hint">{tr('Zoom, Google Meet, Microsoft Teams or any other link. Learners get a Join call button.')}</span>
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
              <NSelect value={visibility} onChange={(e) => setVisibility(e.target.value as Meeting['visibility'])}>
                <option value="live">Only while a lesson is live</option>
                <option value="before15">From 15 minutes before the lesson</option>
                <option value="always">Always</option>
              </NSelect>
            </label>
          </>
        )}

        <div className="field">
          <span>While teaching</span>
          <label className="switch-row">
            <span>
              Show learners where I am
              <span className="hint">{tr('Learners see which task you are on')}</span>
            </span>
            <input type="checkbox" checked={showMarker} onChange={() => setShowMarker((v) => !v)} />
          </label>
          <label className="switch-row">
            <span>
              Show me where learners are
              <span className="hint">{tr('See which task each learner is on')}</span>
            </span>
            <input type="checkbox" checked={seeLearners} onChange={() => setSeeLearners((v) => !v)} />
          </label>
          <label className="switch-row">
            <span>
              Learners can send task elements in messages
              <span className="hint">{tr('Questions, vocabulary boxes and other elements from + Add. When off, learners send text and pictures.')}</span>
            </span>
            <input type="checkbox" checked={learnerElements} onChange={() => setLearnerElements((v) => !v)} />
          </label>
        </div>
        <div className="field">
          <span>What to call people in this class</span>
          <span className="hint">The app uses these words in this class, for you and for them.</span>
          <TermRow label="The people who learn" words={LEARNER_WORDS} one={terms.learner} many={terms.learners} onChange={(a, b) => setTerms({ ...terms, learner: a, learners: b })} />
          <TermRow label="The people who teach" words={TEACHER_WORDS} one={terms.teacher} many={terms.teachers} onChange={(a, b) => setTerms({ ...terms, teacher: a, teachers: b })} />
        </div>
        <div className="field">
          <span>Sounds and videos in live lessons</span>
          <div className="cs-audio" role="radiogroup" aria-label="Sounds and videos in live lessons">
            {LIVE_AUDIO.map((o) => (
              <button key={o.k} type="button" role="radio" aria-checked={liveAudio === o.k} className={'cs-audio-o' + (liveAudio === o.k ? ' on' : '')} onClick={() => setLiveAudio(o.k)}>
                <b>{o.label}</b>
                <span className="hint">{o.about}</span>
              </button>
            ))}
          </div>
          <span className="hint">{tr('Outside live lessons, learners always play sounds themselves.')}</span>
        </div>
        <div className="field cs-learners">
          <span>{tr('Learners')}</span>
          <label className="cs-row">
            <span>
              Messages
              <span className="hint">{tr('Who learners in this class can write to')}</span>
            </span>
            <NSelect value={msgMode} onChange={(e) => setMsgMode(e.target.value as MessagingMode)}>
              <option value="off">No messages</option>
              <option value="teacher">{tr('Only with their teachers')}</option>
              <option value="groups">{tr('Teachers, and groups I set up')}</option>
              <option value="free">Each other freely</option>
            </NSelect>
          </label>
          <label className="cs-row">
            <span>
              Profile pictures
              <span className="hint">Photos are seen by everyone in the class</span>
            </span>
            <NSelect value={photos ? 'photos' : 'icons'} onChange={(e) => setPhotos(e.target.value === 'photos')}>
              <option value="icons">Only the ready-made pictures</option>
              <option value="photos">Ready-made pictures or their own photo</option>
            </NSelect>
          </label>
          <label className="cs-row">
            <span>
              Names other learners see
              <span className="hint">{orgNames ? (nameOk.length === 1 ? `Set by ${org?.name}` : `${org?.name} chooses which ways you can use`) : 'You always see full names'}</span>
            </span>
            <NSelect value={names} disabled={nameOk.length === 1} onChange={(e) => setNames(e.target.value as NameShow)}>
              {nameOk.includes('first') && <option value="first">First name only (Anna)</option>}
              {nameOk.includes('initial') && <option value="initial">First name and initial (Anna S.)</option>}
              {nameOk.includes('full') && <option value="full">Full name (Anna Silva)</option>}
              {nameOk.includes('nick') && <option value="nick">{tr('A nickname I give each learner')}</option>}
            </NSelect>
          </label>
          {names === 'nick' && (
            <div className="cs-nicks">
              {learners === null ? (
                <span className="hint">{tr('Opening the learners…')}</span>
              ) : learners.length === 0 ? (
                <span className="hint">{tr('No learners in this class yet.')}</span>
              ) : (
                learners.map((l) => (
                  <label key={l.id} className="cs-nick">
                    <span>{l.name}</span>
                    <input value={nicks[l.id] ?? ''} placeholder={l.name.split(' ')[0]} maxLength={30} onChange={(e) => setNicks((n) => ({ ...n, [l.id]: e.target.value }))} aria-label={`Nickname for ${l.name}`} />
                  </label>
                ))
              )}
              <span className="hint">{tr('Learners without a nickname show their first name.')}</span>
            </div>
          )}
          <label className="cs-row">
            <span>
              Email and Google sign-in
              <span className="hint">{tr('Learners can link their account to sign in with Google, and add an email for message summaries')}</span>
            </span>
            {orgEmail && <span className="hint cs-org">{emailOk.length === 1 ? `Set by ${org?.name}` : `${org?.name} chooses which you can use`}</span>}
            <NSelect value={emailLink} disabled={emailOk.length === 1} onChange={(e) => setEmailLink(e.target.value as 'off' | 'optional' | 'required')}>
              {emailOk.includes('off') && <option value="off">Not for this class</option>}
              {emailOk.includes('optional') && <option value="optional">{tr('Learners can if they want')}</option>}
              {emailOk.includes('required') && <option value="required">{tr('Every learner must')}</option>}
            </NSelect>
          </label>
          <div className="cs-row cs-tools-row">
            <span>
              Writing tools
              <span className="hint">The tools learners get when they write messages, notes and shared documents. {LEARNER_TOOLS.filter((t) => tools[t.k]).length} of {LEARNER_TOOLS.length} on.</span>
            </span>
            <button type="button" className="btn small-btn" onClick={() => setShowTools((v) => !v)}>
              {showTools ? 'Done' : 'Choose…'}
            </button>
          </div>
          {showTools && (
            <div className="cs-tools">
              {LEARNER_TOOLS.map((t) => (
                <label key={t.k} className={'cs-tool' + (tools[t.k] ? ' on' : '')}>
                  <input type="checkbox" checked={!!tools[t.k]} onChange={() => setTools((x) => ({ ...x, [t.k]: !x[t.k] }))} />
                  <span>{t.label}</span>
                </label>
              ))}
              <span className="hint">{tr('Pronunciation, grammar labels and definitions start off, so learners only see them when you want them to.')}</span>
            </div>
          )}
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

function TermRow({ label, words, one, many, onChange }: { label: string; words: [string, string][]; one: string; many: string; onChange: (one: string, many: string) => void }) {
  const preset = words.some(([a]) => a === one);
  const [own, setOwn] = useState(!preset);
  const cap = (x: string) => x.slice(0, 1).toUpperCase() + x.slice(1);
  return (
    <div className="cs-term">
      <span className="cs-term-l">{label}</span>
      <span className="cs-term-opts" role="radiogroup" aria-label={label}>
        {words.map(([a, b]) => (
          <button key={a} type="button" role="radio" aria-checked={!own && one === a} className={'ap-chip' + (!own && one === a ? ' on' : '')} onClick={() => (setOwn(false), onChange(a, b))}>
            {cap(b)}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={own} className={'ap-chip' + (own ? ' on' : '')} onClick={() => setOwn(true)}>
          Your own…
        </button>
      </span>
      {own && (
        <span className="cs-term-own">
          <input value={one} placeholder="One: apprentice" maxLength={24} onChange={(e) => onChange(e.target.value.toLowerCase(), many)} aria-label="One person" />
          <input value={many} placeholder="More than one: apprentices" maxLength={26} onChange={(e) => onChange(one, e.target.value.toLowerCase())} aria-label="More than one" />
        </span>
      )}
    </div>
  );
}

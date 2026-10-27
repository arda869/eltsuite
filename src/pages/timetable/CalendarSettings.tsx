import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ask } from '../../lib/ask';
import { askToken, forgetToken, googleClientId, ourEvents, prepareGoogle, removeAll, saveGcalSetting, setGoogleClientIdLocal, useGcalSetting } from '../../lib/gcal';
import { cleanUrl, microsoftClientId, prepareMicrosoft, saveVideoPrefs, setMicrosoftClientIdLocal, useVideoPrefs, VIDEO_KINDS, warmTeams, type VideoKind } from '../../lib/meetings';
import { Select } from '../../components/Select';

// Settings, Calendar: the switch for Google Calendar, and (for the owner) the app's Client ID.
type RowT = ComponentType<{ title: string; hint?: string; children: ReactNode }>;
type ToggleT = ComponentType<{ on: boolean; onChange: (v: boolean) => void; label: string }>;

export function CalendarSettings({ uid, owner, Row, Toggle }: { uid: string; owner: boolean; Row: RowT; Toggle: ToggleT }) {
  const g = useGcalSetting(uid);
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // Ready before the click, so Google's window may open straight from it.
  useEffect(() => void prepareGoogle().then(setReady, () => setReady(false)), []);
  const turnOn = async () => {
    setNote('');
    if (!ready) return setNote('Google Calendar is not set up for ELT Suite yet.');
    setBusy(true);
    try {
      await askToken({ consent: true });
      const { calendar } = await ourEvents().catch(() => ({ calendar: '' }));
      await saveGcalSetting(uid, { on: true, epoch: Date.now(), ...(calendar.includes('@') ? { email: calendar } : {}) });
      setNote('Done. Your timetable goes to Google Calendar whenever you open it in ELT Suite.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Google Calendar could not connect. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setNote('');
    const out = await ask('Also take your ELT Suite classes and meetings out of your Google Calendar?', { ok: 'Take them out', cancel: 'Leave them there', title: 'Stop adding to Google Calendar' });
    setBusy(true);
    try {
      if (out) {
        await askToken({ hint: g?.email });
        const n = await removeAll();
        setNote(n ? `Took ${n} out of your Google Calendar.` : '');
      }
      await saveGcalSetting(uid, { on: false });
      forgetToken();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Google Calendar could not be reached.');
      await saveGcalSetting(uid, { on: false }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Row title="Add my timetable to Google Calendar" hint={g?.on && g.email ? `On, in ${g.email}. Changes go there while ELT Suite is open.` : 'Your classes and meetings appear in your Google Calendar, with their video links and a link back here.'}>
        <Toggle label="Add my timetable to Google Calendar" on={!!g?.on} onChange={(v) => !busy && void (v ? turnOn() : turnOff())} />
      </Row>
      {note && (
        <p className="hint" role="status" style={{ margin: 0, padding: '0 18px 12px' }}>
          {note}
        </p>
      )}
      <VideoRows uid={uid} Row={Row} googleOn={!!g?.on} />
      {owner && <ClientIdRow Row={Row} doc_="google" label="Google Client ID (owner only)" hint="From Google Cloud, project lesson-lit. It is public and safe here. Never paste the client secret anywhere." pattern={/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/} placeholder="1234-abc.apps.googleusercontent.com" read={googleClientId} onSaved={(id) => (setGoogleClientIdLocal(id), void prepareGoogle().then(setReady, () => setReady(false)))} />}
      {owner && <ClientIdRow Row={Row} doc_="microsoft" label="Microsoft Client ID (owner only)" hint="The Application (client) ID from Microsoft Entra, for Teams meetings. Public too; never paste a client secret." pattern={/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i} placeholder="00000000-0000-0000-0000-000000000000" read={microsoftClientId} onSaved={(id) => (setMicrosoftClientIdLocal(id), void prepareMicrosoft())} />}
    </>
  );
}

// Which video tool new online sessions use, and the teacher's own Zoom or meeting link.
function VideoRows({ uid, Row, googleOn }: { uid: string; Row: RowT; googleOn: boolean }) {
  const p = useVideoPrefs(uid);
  const kind = p.kind ?? 'eltsuite';
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => setUrl(kind === 'zoom' ? p.zoom ?? '' : kind === 'link' ? p.link ?? '' : ''), [kind, p.zoom, p.link]);
  useEffect(() => void (kind === 'teams' && prepareMicrosoft()), [kind]);
  const hint: Record<VideoKind, string> = {
    eltsuite: 'Classes use their own video room, and meetings get one when they start.',
    meet: googleOn ? 'Each new session gets a Google Meet link, made in your Google Calendar.' : 'Google Meet links are made with Google Calendar: turn on the switch above too.',
    teams: 'Each new session gets a Teams meeting. It needs a work or school Microsoft account.',
    zoom: 'Every new session uses your Zoom link below.',
    link: 'Every new session uses the link below.',
  };
  return (
    <>
      <Row title="Video for new online sessions" hint={hint[kind]}>
        <Select label="Video for new online sessions" value={kind} options={VIDEO_KINDS.map((v) => ({ v: v.k, label: v.label }))} onChange={(k) => void saveVideoPrefs(uid, { ...p, kind: k })} />
      </Row>
      {(kind === 'zoom' || kind === 'link') && (
        <Row title={kind === 'zoom' ? 'Your Zoom link' : 'Your meeting link'} hint={kind === 'zoom' ? 'Your personal meeting room link, from the Zoom app (Meetings, Personal Room).' : 'A link that always opens your meeting room.'}>
          <span className="set-email">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" aria-label={kind === 'zoom' ? 'Your Zoom link' : 'Your meeting link'} inputMode="url" spellCheck={false} />
            <button type="button" className="btn small-btn" disabled={!cleanUrl(url) || cleanUrl(url) === (kind === 'zoom' ? p.zoom : p.link)} onClick={() => void saveVideoPrefs(uid, { ...p, [kind]: cleanUrl(url) })}>
              Save
            </button>
          </span>
        </Row>
      )}
      {kind === 'teams' && (
        <Row title="Microsoft Teams" hint={msg || 'Sign in once to check that your account can make Teams meetings.'}>
          <button type="button" className="btn small-btn" onClick={() => warmTeams().then(() => setMsg('Signed in. New sessions get a Teams meeting.'), (e: Error) => setMsg(e.message))}>
            Sign in to Microsoft
          </button>
        </Row>
      )}
    </>
  );
}

function ClientIdRow({ Row, doc_, label, hint, pattern, placeholder, read, onSaved }: { Row: RowT; doc_: string; label: string; hint: string; pattern: RegExp; placeholder: string; read: () => Promise<string | null>; onSaved: (id: string) => void }) {
  const [v, setV] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => void read().then((id) => setV(id ?? '')), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ok = pattern.test(v.trim());
  return (
    <Row title={label} hint={hint}>
      <span className="set-email">
        <input value={v} onChange={(e) => (setV(e.target.value), setSaved(false))} placeholder={placeholder} aria-label={label} spellCheck={false} />
        <button
          type="button"
          className="btn small-btn"
          disabled={!ok}
          onClick={async () => {
            await setDoc(doc(db, 'admin', doc_), { clientId: v.trim() }, { merge: true });
            setSaved(true);
            onSaved(v.trim());
          }}
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </span>
    </Row>
  );
}

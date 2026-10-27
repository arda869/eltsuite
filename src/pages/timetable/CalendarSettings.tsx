import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ask } from '../../lib/ask';
import { askToken, forgetToken, googleClientId, ourEvents, prepareGoogle, removeAll, saveGcalSetting, setGoogleClientIdLocal, useGcalSetting } from '../../lib/gcal';

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
      {owner && <ClientIdRow Row={Row} onSaved={() => void prepareGoogle().then(setReady, () => setReady(false))} />}
    </>
  );
}

function ClientIdRow({ Row, onSaved }: { Row: RowT; onSaved: () => void }) {
  const [v, setV] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => void googleClientId().then((id) => setV(id ?? '')), []);
  const ok = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(v.trim());
  return (
    <Row title="Google Client ID (owner only)" hint="From Google Cloud, project lesson-lit. It is public and safe here. Never paste the client secret anywhere.">
      <span className="set-email">
        <input value={v} onChange={(e) => (setV(e.target.value), setSaved(false))} placeholder="1234-abc.apps.googleusercontent.com" aria-label="Google Client ID" spellCheck={false} />
        <button
          type="button"
          className="btn small-btn"
          disabled={!ok}
          onClick={async () => {
            await setDoc(doc(db, 'admin', 'google'), { clientId: v.trim() }, { merge: true });
            setGoogleClientIdLocal(v.trim());
            setSaved(true);
            onSaved();
          }}
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </span>
    </Row>
  );
}

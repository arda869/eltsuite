import { useEffect, useState, type ReactNode } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav, LearnerNav } from './ColleaguesPage';
import { Avatar } from '../components/avatars';
import { AvatarPicker } from '../components/AvatarPicker';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';
import { AppSetupDialog } from '../components/AppSetup';
import { ThemeChoice } from '../lib/theme';
import { AFTER, chime, enterSendOn, saveEnterSend, saveMsgPrefs, setSounds, soundsOn, useMsgPrefs } from '../lib/chat';
import { pushState, type PushState } from '../lib/push';
import { UiIcon } from '../components/UiIcon';
import { PIC_QUALITY, type PicQuality } from '../editor/PackNode';

// Everything about you and how Lesson Lit behaves for you, in one place.

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <section className="set-sec">
      <h2 className="set-h">
        <UiIcon name={icon} size={16} />
        {title}
      </h2>
      <div className="set-card">{children}</div>
    </section>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-row-t">
        <b>{title}</b>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <span className="set-row-c">{children}</span>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={'set-toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)} />;
}

export function SettingsPage() {
  const { user, profile, signOutNow } = useAuth();
  const teacher = profile?.role === 'teacher';
  const [picking, setPicking] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [enter, setEnter] = useState(enterSendOn());
  const [sounds, setS] = useState(soundsOn());
  const [push, setPush] = useState<PushState | null>(null);
  const prefs = useMsgPrefs(teacher ? user?.uid : undefined);
  const [classIds, setClassIds] = useState<string[]>([]);
  useEffect(() => {
    if (!user || !teacher) return;
    const add = (ids: string[]) => setClassIds((cur) => [...new Set([...cur, ...ids])]);
    const u1 = onSnapshot(query(collection(db, 'classes'), where('teacherId', '==', user.uid)), (s) => add(s.docs.map((d) => d.id)), () => {});
    const u2 = onSnapshot(query(collection(db, 'classes'), where('teacherIds', 'array-contains', user.uid)), (s) => add(s.docs.map((d) => d.id)), () => {});
    return () => (u1(), u2());
  }, [user, teacher]);
  useEffect(() => void pushState().then(setPush), [appOpen]);
  const [quality, setQ] = useState<PicQuality>(() => {
    try {
      const v = localStorage.getItem('ll.picQuality');
      return v === 'high' || v === 'small' ? v : 'standard';
    } catch {
      return 'standard';
    }
  });
  const pickQ = (v: PicQuality) => {
    setQ(v);
    try {
      localStorage.setItem('ll.picQuality', v);
    } catch {
      /* fine */
    }
  };
  const name = user?.displayName || user?.email?.split('@')[0] || '';

  return (
    <div className="shell">
      <TopBar>{teacher ? <MainNav on="" /> : <LearnerNav on="home" phoneOnly />}</TopBar>
      <main className="set-page">
        <h1 className="page-title">Settings</h1>

        <Section icon="person" title="Profile">
          <div className="set-me">
            <span className="set-av">{profile?.avatar ? <Avatar k={profile.avatar} size={56} /> : <span className="set-av-i">{name.slice(0, 1).toUpperCase()}</span>}</span>
            <span className="set-row-t">
              <b className="set-name">{name}</b>
              <span className="hint">{user?.email || (teacher ? '' : 'Learner')}</span>
            </span>
            <button type="button" className="btn small-btn" onClick={() => setPicking(true)}>
              Change picture
            </button>
          </div>
        </Section>

        <Section icon="message" title="Messages">
          <Row title="Enter to send" hint="Off: Enter starts a new line, and you send with the button">
            <Toggle label="Enter to send" on={enter} onChange={(v) => (saveEnterSend(v), setEnter(v))} />
          </Row>
          <Row title="Sounds" hint="A soft chime when a message comes in">
            <Toggle label="Sounds" on={sounds} onChange={(v) => (setSounds(v), setS(v), v && chime('in'))} />
          </Row>
          {teacher && user && (
            <>
              <Row title="Email me about unread messages" hint="A short summary of what is waiting">
                <Toggle label="Email me about unread messages" on={prefs.email} onChange={(v) => saveMsgPrefs(user.uid, { ...prefs, email: v })} />
              </Row>
              {prefs.email && (
                <Row title="When they stay unread for">
                  <select className="set-select" value={prefs.after} onChange={(e) => saveMsgPrefs(user.uid, { ...prefs, after: Number(e.target.value) })}>
                    {AFTER.map(([m, l]) => (
                      <option key={m} value={m}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Row>
              )}
            </>
          )}
        </Section>

        <Section icon="bell" title="This device">
          <Row title="App and notifications" hint={push === 'on' ? 'Notifications are on for this device' : 'Add Lesson Lit to your home screen and turn on notifications'}>
            <button type="button" className="btn small-btn" onClick={() => setAppOpen(true)}>
              Set up
            </button>
          </Row>
          <Row title="Appearance">
            <ThemeChoice />
          </Row>
        </Section>

        {teacher && (
          <Section icon="archive" title="Resources library">
            <Row title="Picture quality" hint={PIC_QUALITY.find((p) => p.k === quality)?.about}>
              <span className="seg small-seg">
                {PIC_QUALITY.map((p) => (
                  <button key={p.k} type="button" className={quality === p.k ? 'on' : ''} onClick={() => pickQ(p.k)}>
                    {p.label}
                  </button>
                ))}
              </span>
            </Row>
          </Section>
        )}

        <Section icon="lock" title="Account">
          <Row title="Sign out" hint="On this device">
            <button type="button" className="btn small-btn" onClick={signOutNow}>
              Sign out
            </button>
          </Row>
          {teacher && (
            <Row title="Delete my account" hint="Your classes, lessons and learners’ work are removed">
              <button type="button" className="btn small-btn set-danger" onClick={() => setDeleting(true)}>
                Delete…
              </button>
            </Row>
          )}
        </Section>
      </main>
      {picking && <AvatarPicker classIds={classIds} onClose={() => setPicking(false)} />}
      {appOpen && <AppSetupDialog onClose={() => setAppOpen(false)} />}
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </div>
  );
}

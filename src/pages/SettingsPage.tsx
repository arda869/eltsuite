import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
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
import { SoundRecordings } from '../components/SoundRecordings';
import { SfxSettings } from '../components/SfxSettings';
import { StorageCard } from '../components/StorageCard';
import { TOOLS, resetTools, setToolPlace, useToolbarPrefs, type ToolPlace } from '../lib/toolbarPrefs';

// Everything about you and how ELT Suite behaves for you, in one place.

const slug = (t: string) => 'set-' + t.toLowerCase().replace(/[^a-z]+/g, '-');
const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
// One part of settings. On a phone each part folds, so the page is a short list.
function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => !narrow() || title === 'Profile');
  return (
    <section className={'set-sec' + (open ? ' open' : '')} id={slug(title)} data-title={title} data-icon={icon}>
      <h2 className="set-h">
        <button type="button" className="set-h-btn" onClick={() => narrow() && setOpen((o) => !o)} aria-expanded={open}>
          <UiIcon name={icon} size={16} />
          {title}
          <span className="set-chev" aria-hidden="true">›</span>
        </button>
      </h2>
      {open && <div className="set-card">{children}</div>}
    </section>
  );
}

// On a computer: the parts of settings in a list on the left.
function SettingsNav() {
  const [list, setList] = useState<{ id: string; title: string; icon: string }[]>([]);
  const [on, setOn] = useState('');
  useEffect(() => {
    const read = () => setList([...document.querySelectorAll<HTMLElement>('.set-sec')].map((e) => ({ id: e.id, title: e.dataset.title ?? '', icon: e.dataset.icon ?? '' })));
    read();
    const t = window.setTimeout(read, 800);
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setOn(e.target.id)), { rootMargin: '-20% 0px -70% 0px' });
    document.querySelectorAll('.set-sec').forEach((e) => io.observe(e));
    return () => (window.clearTimeout(t), io.disconnect());
  }, []);
  return (
    <nav className="set-nav" aria-label="Settings">
      {list.map((x) => (
        <a key={x.id} href={'#' + x.id} className={on === x.id ? 'on' : ''} onClick={(e) => (e.preventDefault(), document.getElementById(x.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>
          <UiIcon name={x.icon} size={15} />
          {x.title}
        </a>
      ))}
    </nav>
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
  useEffect(() => {
    if (profile?.role === 'learner' && profile.classId) setClassIds([profile.classId]);
  }, [profile]);
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
      <div className="set-layout">
      <SettingsNav />
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
          <Row title="App and notifications" hint={push === 'on' ? 'Notifications are on for this device' : 'Add ELT Suite to your home screen and turn on notifications'}>
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

        {teacher && user && (
          <Section icon="archive" title="Storage">
            <StorageCard uid={user.uid} />
          </Section>
        )}

        {teacher && <ToolbarSettings />}

        {teacher && (
          <Section icon="music" title="Sound effects">
            <SfxSettings />
          </Section>
        )}

        {teacher && (
          <Section icon="mic" title="Sound recordings">
            <SoundRecordings />
          </Section>
        )}

        {!teacher && user && profile?.role === 'learner' && <LearnerAccount uid={user.uid} classId={profile.classId} />}

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
      </div>
      {picking && <AvatarPicker classIds={classIds} onClose={() => setPicking(false)} />}
      {appOpen && <AppSetupDialog onClose={() => setAppOpen(false)} />}
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </div>
  );
}

// Which tools the text toolbar shows, which wait behind the › arrow, and which are hidden.
function ToolbarSettings() {
  const place = useToolbarPrefs();
  const PLACES: [ToolPlace, string][] = [
    ['show', 'Show'],
    ['more', 'Behind ›'],
    ['hide', 'Hide'],
  ];
  return (
    <Section icon="settings" title="Text toolbar">
      <span className="hint set-tb-intro">Choose the tools you see when you write a task. Tools behind › appear when you click the arrow at the end of the toolbar. Everything stays in + Add and the / menu.</span>
      {TOOLS.map((t) => (
        <Row key={t.k} title={t.label}>
          <span className="seg small-seg" role="radiogroup" aria-label={t.label}>
            {PLACES.map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={place(t.k) === k} className={place(t.k) === k ? 'on' : ''} onClick={() => setToolPlace(t.k, k)}>
                {l}
              </button>
            ))}
          </span>
        </Row>
      ))}
      <Row title="Start again" hint="Show every tool">
        <button type="button" className="btn small-btn" onClick={resetTools}>
          Show all
        </button>
      </Row>
    </Section>
  );
}

// A learner's own sign-in and email, when their class allows it: Google sign-in, and an email for
// message summaries.
export function LearnerAccount({ uid, classId }: { uid: string; classId: string }) {
  const [mode, setMode] = useState<'off' | 'optional' | 'required' | null>(null);
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState('');
  const [google, setGoogle] = useState(() => auth.currentUser?.providerData.find((p) => p.providerId === 'google.com')?.email ?? '');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    getDoc(doc(db, 'classes', classId)).then((s) => setMode(s.data()?.accounts?.email ?? 'optional'), () => setMode('optional'));
    getDoc(doc(db, 'users', uid)).then((s) => {
      const e = String(s.data()?.contactEmail ?? '');
      setEmail(e);
      setSaved(e);
    }, () => {});
  }, [uid, classId]);
  if (mode === null || mode === 'off') return null;
  const linkGoogle = async () => {
    setMsg('');
    try {
      const { linkWithPopup } = await import('firebase/auth');
      const r = await linkWithPopup(auth.currentUser!, googleProvider);
      const g = r.user.providerData.find((p) => p.providerId === 'google.com')?.email ?? '';
      setGoogle(g);
      if (g && !saved) await saveEmail(g);
      setMsg('Linked. Next time you can sign in with Google.');
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setMsg(code.includes('credential-already-in-use') || code.includes('email-already-in-use') ? 'That Google account is already used by another ELT Suite account.' : code.includes('popup') ? 'The Google window was closed before it finished.' : 'It could not be linked. Please try again.');
    }
  };
  const saveEmail = async (v = email) => {
    const e = v.trim();
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return setMsg('That email does not look right.');
    await updateDoc(doc(db, 'users', uid), { contactEmail: e, msgPrefs: { email: !!e, after: 60 } }).catch(() => {});
    setSaved(e);
    setEmail(e);
    setMsg(e ? 'Saved. You will get an email when messages wait for you.' : 'Email removed.');
  };
  return (
    <Section icon="person" title="Sign-in and email">
      {mode === 'required' && !google && !saved && <div className="set-must">Your teacher asks everyone to link an email. Link Google, or add your email below.</div>}
      <Row title="Sign in with Google" hint={google ? `Linked to ${google}` : 'Then you can sign in with your Google account instead of your class code and PIN'}>
        {google ? (
          <span className="set-done">Linked</span>
        ) : (
          <button type="button" className="btn small-btn" onClick={() => void linkGoogle()}>
            Link Google
          </button>
        )}
      </Row>
      <Row title="Email for message summaries" hint="When messages wait for you, a short email tells you">
        <span className="set-email">
          <input type="email" value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void saveEmail()} aria-label="Email" />
          <button type="button" className="btn small-btn" disabled={email.trim() === saved} onClick={() => void saveEmail()}>
            Save
          </button>
        </span>
      </Row>
      {msg && <span className="hint set-msg">{msg}</span>}
    </Section>
  );
}

// On a learner's home: a reminder when the class asks everyone to link an email.
export function AccountNudge({ uid, required }: { uid: string; required: boolean }) {
  const [need, setNeed] = useState(false);
  useEffect(() => {
    if (!required) return setNeed(false);
    const google = auth.currentUser?.providerData.some((p) => p.providerId === 'google.com');
    if (google) return setNeed(false);
    getDoc(doc(db, 'users', uid)).then((s) => setNeed(!s.data()?.contactEmail), () => {});
  }, [uid, required]);
  if (!need) return null;
  return (
    <Link to="/settings" className="lh-nudge">
      <UiIcon name="person" size={16} />
      <span>
        <b>Link your email</b>
        <span className="hint">Your teacher asks everyone to link Google or an email, so you can sign in easily and hear about new messages.</span>
      </span>
      <span className="lh-nudge-go">Link it ›</span>
    </Link>
  );
}

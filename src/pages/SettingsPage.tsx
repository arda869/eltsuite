import { NSelect } from '../components/Select';
import { answerOf, profileFieldsOf, saveProfileAnswer, useMyOrg, useTeacherProfile, type ProfileField } from '../lib/admin';
import { ProfileIcon } from '../components/ProfileIcons';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
import { isOwner } from '../lib/phonAudio';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TOOL_FACE } from '../editor/TaskEditor';
import { TextColorTool } from '../editor/TextColor';
import { HighlightTool } from '../editor/Highlight';
import { IconTool } from '../editor/Icons';
import { SymbolTool } from '../editor/Symbols';
import { ProsodyTool } from '../editor/Prosody';
import { StorageCard } from '../components/StorageCard';
import { TOOLS, resetTools, setToolPlace, useToolbarPrefs, type ToolPlace } from '../lib/toolbarPrefs';

// Everything about you and how ELT Suite behaves for you, in one place.

const slug = (t: string) => 'set-' + t.toLowerCase().replace(/[^a-z]+/g, '-');
const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
// One part of settings. On a phone each part folds, so the page is a short list.
const SearchCtx = createContext('');
function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  const [open0, setOpen] = useState(() => !narrow() || title === 'Profile');
  const q = useContext(SearchCtx);
  const open = open0 || !!q;
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
  // Searching: only the parts and rows that mention the words stay in view.
  const [q, setSearch] = useState('');
  const [none, setNone] = useState(false);
  useEffect(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const has = (el: Element) => words.every((w) => (el.textContent ?? '').toLowerCase().includes(w) || (el.querySelector('input, select') as HTMLInputElement | null)?.placeholder?.toLowerCase().includes(w));
    let shown = 0;
    document.querySelectorAll<HTMLElement>('.set-sec').forEach((sec) => {
      const titleHit = words.length > 0 && words.every((w) => (sec.dataset.title ?? '').toLowerCase().includes(w));
      const rows = [...sec.querySelectorAll<HTMLElement>('.set-row')];
      let any = !words.length || titleHit;
      rows.forEach((r) => {
        const hit = !words.length || titleHit || has(r);
        r.style.display = hit ? '' : 'none';
        if (hit) any = true;
      });
      if (!rows.length && words.length && has(sec)) any = true;
      sec.style.display = any ? '' : 'none';
      if (any) shown++;
    });
    setNone(words.length > 0 && shown === 0);
  }, [q]);

  return (
    <div className="shell">
      <TopBar>{teacher ? <MainNav on="" /> : <LearnerNav on="home" phoneOnly />}</TopBar>
      <div className="set-layout">
      <SettingsNav />
      <SearchCtx.Provider value={q.trim()}>
      <main className="set-page">
        <span className="set-titlebar">
          <h1 className="page-title">Settings</h1>
          <label className="set-search">
            <UiIcon name="search" size={15} />
            <input value={q} onChange={(e) => setSearch(e.target.value)} placeholder="Search settings" aria-label="Search settings" onKeyDown={(e) => e.key === 'Escape' && setSearch('')} />
            {q && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear the search">
                ×
              </button>
            )}
          </label>
        </span>
        {q.trim() && none && <p className="hint set-none">No setting matches “{q.trim()}”.</p>}

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

        {teacher && user && <OrgProfile uid={user.uid} />}

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
                  <NSelect className="set-select" value={prefs.after} onChange={(e) => saveMsgPrefs(user.uid, { ...prefs, after: Number(e.target.value) })}>
                    {AFTER.map(([m, l]) => (
                      <option key={m} value={m}>
                        {l}
                      </option>
                    ))}
                  </NSelect>
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
          <Section icon="archive" title="Files">
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

        {teacher && !isOwner() && (
          <Section icon="music" title="Sound effects">
            <SfxSettings />
          </Section>
        )}

        {teacher && !isOwner() && (
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
      </SearchCtx.Provider>
      </div>
      {picking && <AvatarPicker classIds={classIds} onClose={() => setPicking(false)} />}
      {appOpen && <AppSetupDialog onClose={() => setAppOpen(false)} />}
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </div>
  );
}

// Which tools the text toolbar shows, which wait behind the › arrow, and which are hidden.
// The real toolbar, drawn with the real buttons: drag a tool between the bar, the › tray and the shelf.
function ToolbarSettings() {
  const place = useToolbarPrefs();
  const ed = useEditor({ extensions: [StarterKit], content: '', editable: false });
  const face = (k: string) =>
    !ed ? null : k === 'color' ? <TextColorTool editor={ed} /> : k === 'highlight' ? <HighlightTool editor={ed} /> : k === 'icons' ? <IconTool editor={ed} /> : k === 'symbols' ? <SymbolTool editor={ed} /> : k === 'pron' ? <ProsodyTool editor={ed} /> : <span className="tool">{TOOL_FACE[k]}</span>;
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<ToolPlace | null>(null);
  const ORDER: ToolPlace[] = ['show', 'more', 'hide'];
  const NAMES: Record<ToolPlace, string> = { show: 'On the toolbar', more: 'Behind ›', hide: 'Not shown' };
  const drop = (z: ToolPlace) => (e: React.DragEvent) => {
    e.preventDefault();
    const k = e.dataTransfer.getData('text/tool') || drag;
    if (k) setToolPlace(k, z);
    setDrag(null);
    setOver(null);
  };
  const zone = (z: ToolPlace) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== z) setOver(z);
    },
    onDragLeave: (e: React.DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null),
    onDrop: drop(z),
    'data-over': over === z || undefined,
  });
  const chip = (t: (typeof TOOLS)[number], big: boolean) => {
    const z = place(t.k);
    return (
      <span
        key={t.k}
        role="button"
        tabIndex={0}
        draggable
        className={'tbs-chip' + (big ? '' : ' wide') + (drag === t.k ? ' dragging' : '')}
        data-tip={big ? t.label : undefined}
        aria-label={`${t.label}: ${NAMES[z]}. Use the up and down arrows to move it.`}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/tool', t.k);
          e.dataTransfer.effectAllowed = 'move';
          setDrag(t.k);
        }}
        onDragEnd={() => {
          setDrag(null);
          setOver(null);
        }}
        onKeyDown={(e) => {
          const i = ORDER.indexOf(z);
          const to = e.key === 'ArrowDown' ? ORDER[i + 1] : e.key === 'ArrowUp' ? ORDER[i - 1] : undefined;
          if (!to) return;
          e.preventDefault();
          setToolPlace(t.k, to);
          requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-tool="${t.k}"]`)?.focus());
        }}
        data-tool={t.k}
      >
        <span className="tbs-face" aria-hidden="true" {...{ inert: "" }}>{face(t.k)}</span>
        {!big && <span className="tbs-name">{t.label}</span>}
      </span>
    );
  };
  const of = (z: ToolPlace) => TOOLS.filter((t) => place(t.k) === z);
  const more = of('more');
  const hidden = of('hide');
  return (
    <Section icon="settings" title="Text toolbar">
      <span className="hint set-tb-intro">Drag tools onto the toolbar, into the › tray, or onto the shelf to hide them. Everything stays in + Add and the / menu.</span>
      <div className={'tbs' + (drag ? ' is-dragging' : '')}>
        <div className="tbs-bar toolbar" {...zone('show')} aria-label="On the toolbar">
          {of('show').map((t) => chip(t, true))}
          {of('show').length === 0 && <span className="tbs-empty">Drop tools here</span>}
          <span className="tbs-arrow" aria-hidden="true">›</span>
        </div>
        <div className="tbs-tray" {...zone('more')} aria-label="Behind the arrow">
          <span className="tbs-cap">Behind ›</span>
          <div className="tbs-list">
            {more.map((t) => chip(t, false))}
            {more.length === 0 && <span className="tbs-empty">Tools you use now and then</span>}
          </div>
        </div>
        <div className="tbs-shelf" {...zone('hide')} aria-label="Not shown">
          <span className="tbs-cap">Not shown</span>
          <div className="tbs-list">
            {hidden.map((t) => chip(t, false))}
            {hidden.length === 0 && <span className="tbs-empty">Drop a tool here to hide it</span>}
          </div>
        </div>
        <div className="tbs-foot">
          <span className="hint">Or select a tool and press the up or down arrow.</span>
          <button type="button" className="btn small-btn" onClick={resetTools}>
            Back to the default
          </button>
        </div>
      </div>
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

// The profile an organisation asks its teachers for: the fields its admins chose, saved as you type.
function OrgProfile({ uid }: { uid: string }) {
  const org = useMyOrg();
  const mine = useTeacherProfile(uid);
  if (!org?.policy?.profiles) return null;
  const fields = profileFieldsOf(org.policy).filter((f) => f.on);
  return (
    <Section icon="person" title={`Your profile in ${org.name}`}>
      <div className="set-pf-wrap">
        <p className="hint set-pf-intro">Teachers in {org.name} see this on your page in Colleagues.</p>
        {mine === undefined ? (
          <span className="hint">Opening your profile…</span>
        ) : (
          fields.map((f) => <ProfileAnswer key={f.id} f={f} value={answerOf(mine, f.id)} onSave={(v) => void saveProfileAnswer(uid, org.id, f.id, v)} />)
        )}
      </div>
    </Section>
  );
}
function ProfileAnswer({ f, value, onSave }: { f: ProfileField; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const save = () => v !== value && onSave(v);
  return (
    <label className="set-pf">
      <span className="set-pf-h">
        <ProfileIcon name={f.icon} size={16} />
        {f.label}
      </span>
      {f.kind === 'long' ? (
        <textarea rows={3} value={v} onChange={(e) => setV(e.target.value)} onBlur={save} maxLength={1200} />
      ) : (
        <input value={v} onChange={(e) => setV(e.target.value)} onBlur={save} maxLength={300} placeholder={f.kind === 'list' ? 'Separate them with commas' : ''} />
      )}
    </label>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { isLearnerEmail } from '../lib/learners';
import { allTeacherClasses, canEdit } from '../lib/coteach';
import type { ClassDoc } from '../lib/classes';
import { acceptColleague, copyLessonInto, copyMediaToArchive, copyTasksInto, readColleagueLink, readShare, rememberShare, shareTasks, type Share, type SharedTask } from '../lib/sharing';
import { addTask, tasksCol } from '../lib/tasks';
import { newCollab } from '../editor/CollabNode';
import { copyState } from '../collab/provider';
import { newId } from '../lib/tasks';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { Loader } from '../components/Loader';
import { UiIcon } from '../components/UiIcon';
import { TaskRenderer } from '../components/TaskRenderer';
import { CollabDoc } from '../collab/CollabDoc';
import { SlidesDoc } from '../collab/slides/SlidesDoc';
import { MediaPlayer } from '../media/Player';
import { useImageSrc } from '../editor/PackNode';
import { questionIds, scoreTask, type AnswerKey } from '../lib/questions';
import type { Responses } from '../lib/tasks';

// A lesson, task, shared document or piece of media a colleague shared: read-only, with
// "Make my own copy". Opening a link signs you in first, then comes back here.

const KIND: Record<Share['kind'], string> = { lesson: 'Lesson', task: 'Task', doc: 'Shared document', media: 'Media' };
export const AFTER_SIGN_IN = 'll.afterSignIn';

function SignInFirst({ what }: { what: string }) {
  const navigate = useNavigate();
  return (
    <div className="sp-empty">
      <UiIcon name="lock" size={26} />
      <h1 className="page-title">Sign in to open {what}</h1>
      <p className="hint">Colleagues share with teachers who use ELT Suite. Sign in, or make a free account, and you come straight back here.</p>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          try {
            sessionStorage.setItem(AFTER_SIGN_IN, window.location.pathname);
          } catch {
            /* fine */
          }
          navigate('/');
        }}
      >
        Sign in
      </button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <TopBar>
        <MainNav on="" />
      </TopBar>
      <div className="sp">{children}</div>
    </div>
  );
}

export function SharedPage() {
  const { id = '' } = useParams();
  const { user, ready } = useAuth();
  const [sh, setSh] = useState<Share | 'denied' | null | undefined>(undefined);
  const [tasks, setTasks] = useState<SharedTask[]>([]);
  const [cur, setCur] = useState(0);
  const [copying, setCopying] = useState(false);
  const teacher = !!user && !isLearnerEmail(user.email);
  useEffect(() => {
    if (!teacher) return;
    readShare(id).then((s) => {
      setSh(s);
      if (s && s !== 'denied') {
        if (s.owner !== user!.uid) rememberShare(user!.uid, s);
        if (s.kind === 'lesson' || s.kind === 'task') shareTasks(id).then(setTasks, () => setTasks([]));
      }
    });
  }, [id, teacher]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready) return <Loader label="Opening" />;
  if (!teacher) return <Shell>{<SignInFirst what="what a colleague shared" />}</Shell>;
  if (sh === undefined) return <Shell>{<Loader label="Opening what was shared" />}</Shell>;
  if (sh === null || sh === 'denied')
    return (
      <Shell>
        <div className="sp-empty">
          <UiIcon name="lock" size={26} />
          <h1 className="page-title">{sh === null ? 'This is no longer shared' : 'This was not shared with you'}</h1>
          <p className="hint">{sh === null ? 'The teacher who shared it has stopped sharing it.' : 'Ask the teacher who sent the link to share it with you, or to share it with anyone who has the link.'}</p>
          <Link className="btn" to="/archive?show=shared">
            Shared with me
          </Link>
        </div>
      </Shell>
    );
  return (
    <Shell>
      <SharedContent sh={sh} tasks={tasks} cur={cur} setCur={setCur} onCopy={() => setCopying(true)} />
      {copying && <CopyOut sh={sh} tasks={tasks} onClose={() => setCopying(false)} />}
    </Shell>
  );
}

// What was shared, on its page or in a window over a chat. In "play" the tasks work as they do
// for learners: spin the wheel, fill the gaps, then check.
function SharedContent({ sh, tasks, cur, setCur, onCopy, play }: { sh: Share; tasks: SharedTask[]; cur: number; setCur: (i: number) => void; onCopy: () => void; play?: boolean }) {
  const { user } = useAuth();
  const shown = tasks.filter((t) => t.data.kind !== 'section');
  const t = shown[cur];
  const mine = sh.owner === user!.uid;
  return (
    <>
      <header className="sp-head">
        <span className="sp-kind">
          {KIND[sh.kind]}
          <span className="sp-ro">
            <UiIcon name={play ? 'pointer' : 'lock'} size={12} /> {play ? 'Try it out' : 'Read-only'}
          </span>
        </span>
        <h1 className="page-title">{sh.title}</h1>
        <span className="hint">
          {mine ? 'Shared by you' : `Shared by ${sh.ownerName}`} · {new Date(sh.updated ?? sh.at ?? Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          {sh.kind === 'lesson' && ` · ${sh.count ?? shown.length} ${(sh.count ?? shown.length) === 1 ? 'task' : 'tasks'}`}
        </span>
        <span className="sp-acts">
          <button type="button" className="btn primary" onClick={onCopy}>
            Make my own copy
          </button>
        </span>
      </header>

      {(sh.kind === 'lesson' || sh.kind === 'task') && (
        <div className={'sp-body' + (sh.kind === 'task' ? ' one' : '')}>
          {sh.kind === 'lesson' && (
            <nav className="sp-tasks" aria-label="Tasks">
              {shown.map((x, i) => (
                <button key={x.id} type="button" className={i === cur ? 'on' : ''} onClick={() => setCur(i)}>
                  <span className="it-n">{i + 1}</span>
                  {String(x.data.title || 'Untitled task')}
                </button>
              ))}
            </nav>
          )}
          <article className="sp-task">
            {!t ? <Loader label="Reading the tasks" /> : play ? <PlayTask key={t.id} t={t} space={'share:' + sh.id} /> : (
              <>
                <h2 className="sp-task-t">{String(t.data.title || 'Untitled task')}</h2>
                {t.data.instructions && <p className="sp-task-i">{String(t.data.instructions)}</p>}
                <div className="doc sp-doc">
                  <TaskRenderer content={t.data.content ?? null} responses={{}} onChange={() => {}} disabled classId={'share:' + sh.id} />
                </div>
                {t.notes?.text && (
                  <aside className="sp-notes">
                    <span className="eyebrow">Teacher notes</span>
                    <p>{String(t.notes.text)}</p>
                  </aside>
                )}
              </>
            )}
          </article>
        </div>
      )}
      {sh.kind === 'doc' && sh.src.docKey && user && (
        <div className="sp-docwrap">
          {sh.src.docKind === 'slides' ? (
            <SlidesDoc docKey={sh.src.docKey} title={sh.title} modes={['view']} me={{ uid: user.uid, name: user.displayName || 'Teacher' }} classId="" display="inline" canDownload />
          ) : (
            <CollabDoc docKey={sh.src.docKey} title={sh.title} modes={['view']} me={{ uid: user.uid, name: user.displayName || 'Teacher' }} classId="" display="inline" canDownload />
          )}
        </div>
      )}
      {sh.kind === 'media' && <SharedMedia sh={sh} />}
    </>
  );
}

// One task to try: answer it like a learner, check, try again. Nothing is saved.
function PlayTask({ t, space }: { t: SharedTask; space: string }) {
  const [responses, setResponses] = useState<Responses>({});
  const [checked, setChecked] = useState<AnswerKey | null>(null);
  const qs = questionIds(t.data.content ?? null);
  const key = (t.key ?? {}) as AnswerKey;
  const score = checked ? scoreTask(qs, key, responses) : null;
  return (
    <>
      <h2 className="sp-task-t">{String(t.data.title || 'Untitled task')}</h2>
      {t.data.instructions && <p className="sp-task-i">{String(t.data.instructions)}</p>}
      <div className="doc sp-doc">
        <TaskRenderer content={t.data.content ?? null} responses={responses} onChange={(id, r) => !checked && setResponses((x) => ({ ...x, [id]: r }))} results={checked} classId={space} />
      </div>
      {qs.length > 0 && (
        <div className="sp-play-foot">
          {checked ? (
            <>
              <span className="ld-pct">{score!.total ? `${score!.score} of ${score!.total} correct` : 'Done'}</span>
              <button type="button" className="btn" onClick={() => (setChecked(null), setResponses({}))}>
                Try again
              </button>
            </>
          ) : (
            <>
              <span className="hint">Just for you: nothing is saved</span>
              <button type="button" className="btn primary" disabled={!Object.keys(responses).length} onClick={() => setChecked(key)}>
                Check answers
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

// A shared lesson or task in a window over the chat, to try out without leaving the messages.
export function SharedWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sh, setSh] = useState<Share | 'denied' | null | undefined>(undefined);
  const [tasks, setTasks] = useState<SharedTask[]>([]);
  const [cur, setCur] = useState(0);
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    readShare(id).then((s) => {
      setSh(s);
      if (s && s !== 'denied') {
        if (user && s.owner !== user.uid) rememberShare(user.uid, s);
        if (s.kind === 'lesson' || s.kind === 'task') shareTasks(id).then(setTasks, () => setTasks([]));
      }
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !copying && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, copying]);
  return (
    <div className="scrim sp-scrim" onClick={onClose}>
      <div className="dialog sp-window" role="dialog" aria-label="Shared material" onClick={(e) => e.stopPropagation()}>
        <div className="sp-window-bar">
          <button type="button" className="btn link small" onClick={() => navigate(`/s/${id}`)}>
            Open as a page
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>×</span>
          </button>
        </div>
        <div className="sp sp-in-window">
          {sh === undefined ? (
            <Loader label="Opening what was shared" />
          ) : sh === null || sh === 'denied' ? (
            <div className="sp-empty">
              <UiIcon name="lock" size={26} />
              <h1 className="page-title">{sh === null ? 'This is no longer shared' : 'This was not shared with you'}</h1>
            </div>
          ) : (
            <SharedContent sh={sh} tasks={tasks} cur={cur} setCur={setCur} onCopy={() => setCopying(true)} play />
          )}
        </div>
        {copying && sh && sh !== 'denied' && <CopyOut sh={sh} tasks={tasks} onClose={() => setCopying(false)} />}
      </div>
    </div>
  );
}

function SharedMedia({ sh }: { sh: Share }) {
  const a = sh.archive ?? {};
  const space = 'share:' + sh.id;
  const img = useImageSrc(a.home ? space : '', a.home ? 'media:' + a.home.mediaId : a.link ?? '');
  if (a.kind === 'image') return <div className="sp-media">{img ? <img src={img} alt="" /> : <span className="pic-wait" />}</div>;
  if (a.home) return <div className="sp-media wide"><MediaPlayer classId={space} mediaId={a.home.mediaId} title={a.name} /></div>;
  return (
    <div className="sp-media">
      <a href={a.link} target="_blank" rel="noreferrer">
        {a.link}
      </a>
    </div>
  );
}

// Where my copy goes: a class (for a lesson), a lesson (for a task or a document), or my archive.
function CopyOut({ sh, tasks, onClose }: { sh: Share; tasks: SharedTask[]; onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [toClass, setToClass] = useState('');
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [toItem, setToItem] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const needLesson = sh.kind === 'task' || sh.kind === 'doc';
  useEffect(() => {
    if (!user || sh.kind === 'media') return;
    allTeacherClasses(user.uid).then((all) => {
      const list = all.filter((c) => c.status === 'active' && canEdit(c, user.uid)).sort((a, b) => a.name.localeCompare(b.name));
      setClasses(list);
      setToClass(list[0]?.id ?? '');
    });
  }, [user, sh.kind]);
  useEffect(() => {
    if (!needLesson || !toClass) return;
    getDocs(collection(db, 'classes', toClass, 'items')).then((s) => {
      const list = s.docs.map((d) => ({ id: d.id, title: String(d.data().title ?? 'Untitled'), order: Number(d.data().order ?? 0) })).sort((a, b) => a.order - b.order);
      setLessons(list);
      setToItem(list[0]?.id ?? '');
    });
  }, [needLesson, toClass]);
  async function go() {
    if (!user) return;
    setBusy('Copying…');
    setErr('');
    try {
      if (sh.kind === 'media') {
        await copyMediaToArchive(sh, user.uid);
        navigate('/archive');
      } else if (sh.kind === 'lesson') {
        const id = await copyLessonInto(sh, tasks, toClass);
        navigate(`/class/${toClass}/lesson/${id}`);
      } else if (sh.kind === 'task') {
        const id = await copyTasksInto(sh, tasks, toClass, toItem);
        navigate(`/class/${toClass}/lesson/${toItem}?task=${id}`);
      } else if (sh.kind === 'doc' && sh.src.docKey) {
        // A new task with a shared document that begins as a copy of this one.
        const key = newId();
        await copyState(sh.src.docKey, key);
        await copyState(`${sh.src.docKey}~t`, `${key}~t`).catch(() => false);
        const block = newCollab();
        const ex = await getDocs(tasksCol(toClass, toItem));
        const order = ex.docs.reduce((m, d) => Math.max(m, Number(d.data().order ?? 0)), -1) + 1;
        const id = await addTask(toClass, toItem, order, 'task', { title: sh.title, instructions: '', content: { type: 'doc', content: [{ ...block, attrs: { ...block.attrs, docKey: key, kind: sh.src.docKind ?? 'doc', title: sh.title, scope: 'class' } }, { type: 'paragraph' }] } });
        navigate(`/class/${toClass}/lesson/${toItem}?task=${id}`);
      }
    } catch (e) {
      console.error(e);
      setErr('The copy didn’t work. Please try again.');
      setBusy('');
    }
  }
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Make my own copy" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Make my own copy</h2>
        <span className="hint">{sh.kind === 'media' ? 'It goes into your resources library, ready to use in any lesson.' : 'Your copy is yours to change. The shared one stays as it is.'}</span>
        {sh.kind !== 'media' &&
          (classes.length === 0 ? (
            <span className="hint">You need a class first. Make one on the Classes page.</span>
          ) : (
            <label className="field">
              Into class
              <select value={toClass} onChange={(e) => setToClass(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        {needLesson && toClass && (
          <label className="field">
            Into lesson
            <select value={toItem} onChange={(e) => setToItem(e.target.value)}>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {sh.kind === 'lesson' && <span className="hint">The copy starts hidden from learners until you show it.</span>}
        {err && <span className="error">{err}</span>}
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {busy && <span className="hint">{busy}</span>}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!!busy || (sh.kind !== 'media' && !toClass) || (needLesson && !toItem)} onClick={go}>
            Copy
          </button>
        </span>
      </div>
    </div>
  );
}

// /colleague/<token>: connect with the teacher who sent the link.
export function ColleagueJoin() {
  const { token = '' } = useParams();
  const { user, ready } = useAuth();
  const [from, setFrom] = useState<{ name: string; email?: string; from: string } | null | undefined>(undefined);
  const [state, setState] = useState<'' | 'busy' | 'done' | 'self' | 'org' | 'error'>('');
  const teacher = !!user && !isLearnerEmail(user.email);
  useEffect(() => {
    if (teacher) readColleagueLink(token).then(setFrom, () => setFrom(null));
  }, [token, teacher]);
  if (!ready) return <Loader label="Opening" />;
  if (!teacher) return <Shell>{<SignInFirst what="this invitation" />}</Shell>;
  if (from === undefined) return <Shell>{<Loader label="Opening the invitation" />}</Shell>;
  if (from === null)
    return (
      <Shell>
        <div className="sp-empty">
          <UiIcon name="link" size={26} />
          <h1 className="page-title">This invitation has ended</h1>
          <p className="hint">Ask your colleague for a new link.</p>
        </div>
      </Shell>
    );
  const accept = async () => {
    setState('busy');
    try {
      await acceptColleague(token, { uid: user!.uid, name: user!.displayName || user!.email?.split('@')[0] || 'A colleague', email: user!.email ?? '' });
      setState('done');
    } catch (e) {
      setState((e as Error).message === 'self' ? 'self' : (e as Error).message === 'org' ? 'org' : 'error');
    }
  };
  return (
    <Shell>
      <div className="sp-empty">
        <span className="sp-av">{from.name.trim().slice(0, 1).toUpperCase()}</span>
        {state === 'done' ? (
          <>
            <h1 className="page-title">You and {from.name.split(' ')[0]} are now colleagues</h1>
            <p className="hint">You can share lessons, tasks, documents and media with each other. Find what they share in your archive, under Shared with me.</p>
            <Link className="btn primary" to="/colleagues">
              See my colleagues
            </Link>
          </>
        ) : (
          <>
            <h1 className="page-title">{from.name} invites you to be colleagues</h1>
            <p className="hint">Colleagues can share lessons, tasks, documents and media with each other, as read-only copies. Nothing is shared until one of you chooses to share it.</p>
            {state === 'self' && <span className="error">This is your own invitation link. Send it to a colleague.</span>}
            {state === 'org' && <span className="error">Your organisation, or theirs, keeps colleagues within the organisation, so you cannot add each other.</span>}
            {state === 'error' && <span className="error">That didn’t work. The link may have ended; ask for a new one.</span>}
            <span style={{ display: 'flex', gap: 8 }}>
              <Link className="btn" to="/">
                Not now
              </Link>
              <button type="button" className="btn primary" disabled={state === 'busy'} onClick={accept}>
                {state === 'busy' ? 'Connecting…' : 'Accept'}
              </button>
            </span>
          </>
        )}
      </div>
    </Shell>
  );
}

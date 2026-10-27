import { tr, useClassTerms } from '../lib/terms';
import { ask } from '../lib/ask';
import { Loader } from '../components/Loader';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { updateClass, type ClassDoc, type Item, type Topic, classDates } from '../lib/classes';
import type { Learner } from '../lib/learners';
import { theme } from '../lib/themes';
import { TopBar } from '../components/TopBar';
import { LessonsTab } from '../components/LessonsTab';
import { DeleteClassDialog } from '../components/DeleteClassDialog';
import { AnnounceDialog } from '../components/AnnounceDialog';
import { useClassmates } from '../lib/learners';
import { LearnersTab } from '../components/LearnersTab';
import { PortfolioTab } from '../components/Portfolio';
import { VideoButton } from '../components/VideoCall';
import { ClassSettingsDialog } from '../components/ClassSettingsDialog';
import { DiscussionBoard, DiscussionSettingsPanel } from '../components/Discussion';
import { CoverArt } from '../components/Covers';
import { Notebook } from '../components/Notebook';
import { Reports } from '../components/Reports';
import { useAuth } from '../lib/auth';

type Tab = 'lessons' | 'learners' | 'notebook' | 'reports' | 'discussion' | 'portfolio';

function useCollection<T>(path: string[], ready: boolean) {
  const [rows, setRows] = useState<T[]>([]);
  const key = path.join('/');
  useEffect(() => {
    if (!ready) return;
    return onSnapshot(
      collection(db, key),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
      (e) => console.error(key, e),
    );
  }, [key, ready]);
  return rows;
}

export function ClassPage() {
  const { classId = '' } = useParams();
  useClassTerms(classId);
  const navigate = useNavigate();
  const [c, setC] = useState<ClassDoc | null | undefined>(undefined);
  const roster = useClassmates(c?.classCode ?? undefined);
  const [params] = useSearchParams();
  const focusEntry = params.get('entry');
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'discussion' || params.get('thread') ? 'discussion' : params.get('tab') === 'reports' ? 'reports' : params.get('tab') === 'portfolio' ? 'portfolio' : params.get('tab') === 'learners' || params.get('learner') ? 'learners' : 'lessons');
  const [learnerOpen, setLearnerOpen] = useState(params.get('learner') ?? '');
  const [thread, setThread] = useState<string | null>(params.get('thread'));
  const { user } = useAuth();
  const [resultsItem, setResultsItem] = useState<Item | null>(null);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // The class, tried again a few times before giving up: right after signing in, or when the
  // connection drops, the first read can fail even though the class is there.
  const [why, setWhy] = useState<{ code: string; attempt: number }>({ code: '', attempt: 0 });
  useEffect(() => {
    let timer = 0;
    const stop = onSnapshot(
      doc(db, 'classes', classId),
      (s) => {
        if (s.exists()) return setC({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }), setWhy((w) => ({ ...w, code: '' }));
        if (s.metadata.fromCache) return; // wait for the server before saying it is gone
        setWhy((w) => ({ ...w, code: 'deleted' }));
        setC(null);
      },
      (e: { code?: string }) => {
        console.error('class', classId, e);
        if (why.attempt < 3) timer = window.setTimeout(() => setWhy((w) => ({ code: '', attempt: w.attempt + 1 })), 900 * (why.attempt + 1));
        else setWhy((w) => ({ ...w, code: e.code ?? 'error' })), setC(null);
      },
    );
    return () => (stop(), clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, why.attempt]);

  const ok = !!c;
  const topics = useCollection<Topic>(['classes', classId, 'topics'], ok);
  const items = useCollection<Item>(['classes', classId, 'items'], ok);
  const learners = useCollection<Learner>(['classes', classId, 'learners'], ok);
  const secrets = useCollection<{ id: string; pin?: string; own?: boolean; kind?: string }>(['classes', classId, 'secrets'], ok);
  const pins = Object.fromEntries(secrets.filter((s) => !s.own).map((s) => [s.id, s.pin ?? '']));
  const ownSecret = Object.fromEntries(secrets.filter((s) => s.own).map((s) => [s.id, s.kind === 'password' ? 'password' : 'PIN']));

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const t = theme(c?.themeColor);
  const style = { ['--accent' as string]: t.accent, ['--accent-text' as string]: t.text };

  async function copyCode() {
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c.classCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  async function archive() {
    if (!c) return;
    setMenu(false);
    if (!(await ask(`Archive ${c.name}? Everything is kept and you can restore it later.`))) return;
    await updateClass(c, { status: 'archived' });
    navigate('/classes');
  }

  return (
    <div className="shell" style={style}>
      <TopBar>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/classes">Classes</Link>
          <span aria-hidden="true">/</span>
          <span className="here">{c?.name ?? '…'}</span>
        </nav>
      </TopBar>

      {c === null && (
        <div className="class-missing">
          <h1 className="page-title">{why.code === 'deleted' ? 'This class has been deleted' : why.code === 'unavailable' ? 'The class could not be reached' : 'This class can’t be opened'}</h1>
          <p className="hint">
            {why.code === 'deleted'
              ? 'It is no longer on the server. If it still shows on your home screen, reload the page.'
              : why.code === 'permission-denied'
                ? tr('Your account does not have access to it. This happens when a co-teacher removes you, or when the class belongs to another of your accounts.')
                : why.code === 'unavailable'
                  ? 'Check your connection and try again.'
                  : 'Something went wrong while opening it.'}
          </p>
          <span className="hint small">
            Class {classId} · {why.code || 'unknown'}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={() => (setC(undefined), setWhy({ code: '', attempt: 0 }))}>
              Try again
            </button>
            <Link to="/classes" className="btn primary">
              Back to your classes
            </Link>
          </span>
        </div>
      )}
      {c === undefined && <Loader full label="Opening the class" />}

      {c && (
        <>
          <div className="class-hero">
          <div className="ch-text">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h1 className="page-title">{c.name}</h1>
              <div className="class-meta">
                <span>
                  {c.level} · {learners.length} {tr(learners.length === 1 ? 'learner' : 'learners')}
                  {classDates(c) ? ` · ${classDates(c)}` : ''}
                  {c.status === 'archived' ? ' · archived' : ''}
                </span>
                <span className="code-chip">
                  Class code <strong>{c.classCode}</strong>
                  <button type="button" onClick={copyCode}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </span>
                <VideoButton c={c} name={user?.displayName || 'Teacher'} teacher />
                {c.meeting?.url && (
                  <a className="meet-link" href={c.meeting.url} target="_blank" rel="noopener noreferrer">
                    Open call
                  </a>
                )}
              </div>
            </div>
            <div className="menu-anchor" ref={menuRef}>
              <button className="btn icon-only" aria-label="Class actions" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                ⋯
              </button>
              {menu && (
                <div className="menu" role="menu">
                  <button role="menuitem" onClick={() => (setMenu(false), setSettings(true))}>
                    Class settings
                  </button>
                  <button role="menuitem" onClick={() => (setMenu(false), setAnnouncing(true))}>
                    Send an announcement
                  </button>
                  {c.status === 'active' ? (
                    <button role="menuitem" onClick={archive}>
                      Archive class
                      <span className="hint" style={{ display: 'block' }}>
                        Keep everything, read-only
                      </span>
                    </button>
                  ) : (
                    <button role="menuitem" onClick={() => (setMenu(false), updateClass(c, { status: 'active' }))}>
                      Restore class
                    </button>
                  )}
                  {c.teacherId === user?.uid && (
                  <button role="menuitem" className="danger-item" onClick={() => (setMenu(false), setDeleting(true))}>
                    Delete class…
                  </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <CoverArt cover={c.cover} classId={c.id} className="ch-cover" />
          </div>

          {announcing && <AnnounceDialog classId={c.id} roster={roster} onClose={() => setAnnouncing(false)} />}
          {deleting && <DeleteClassDialog c={c} onClose={() => setDeleting(false)} onDeleted={() => navigate('/classes')} />}
          <nav className="tabs" aria-label="Class sections">
            <button className={tab === 'lessons' ? 'on' : ''} onClick={() => setTab('lessons')}>
              Lessons and work
            </button>
            <button className={tab === 'learners' ? 'on' : ''} onClick={() => (setTab('learners'), setLearnerOpen(''))}>
              {tr('Learners')} <span className="count">{learners.length}</span>
            </button>
            <button className={tab === 'discussion' ? 'on' : ''} onClick={() => setTab('discussion')}>
              Discussion
            </button>
            <button className={tab === 'reports' ? 'on' : ''} onClick={() => (setResultsItem(null), setTab('reports'))}>
              Reports
            </button>
            <button className={tab === 'portfolio' ? 'on' : ''} onClick={() => setTab('portfolio')}>
              Portfolio
            </button>
          </nav>

          {tab === 'lessons' ? (
            <LessonsTab c={c} topics={topics} items={items} onResults={(i) => (setResultsItem(i), setTab('reports'))} />
          ) : tab === 'learners' ? (
            <LearnersTab c={c} learners={learners} pins={pins} own={ownSecret} items={items} openId={learnerOpen} onOpen={setLearnerOpen} />
          ) : tab === 'portfolio' ? (
            <PortfolioTab c={c} learners={learners} items={items} />
          ) : tab === 'reports' ? (
            <Reports key={resultsItem?.id ?? 'all'} c={c} items={items} learners={learners} initialItem={resultsItem} />
          ) : tab === 'discussion' ? (
            user && (
              <div className="disc-tab">
                <DiscussionBoard c={c} me={{ uid: user.uid, name: (user.displayName || 'Teacher').split(' ')[0], teacher: true }} people={[...learners.map((l) => ({ uid: l.authUid, name: l.displayName, learnerId: l.id })), { uid: user.uid, name: 'teacher' }]} open={thread} onOpen={setThread} />
                {!thread && (
                  <details className="disc-settings-wrap">
                    <summary>Board settings</summary>
                    <DiscussionSettingsPanel c={c} people={learners.map((l) => ({ uid: l.authUid, name: l.displayName, learnerId: l.id }))} />
                  </details>
                )}
              </div>
            )
          ) : (
            user && <Notebook classId={c.id} c={c} me={{ uid: user.uid, name: (user.displayName || 'Teacher').split(' ')[0], teacher: true }} items={[...items].sort((a, b) => a.order - b.order)} topics={[...topics].sort((a, b) => a.order - b.order)} roster={roster} focus={focusEntry} />
          )}
        </>
      )}

      {settings && c && <ClassSettingsDialog c={c} onClose={() => setSettings(false)} />}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { updateClass, type ClassDoc, type Item, type Topic } from '../lib/classes';
import type { Learner } from '../lib/learners';
import { theme } from '../lib/themes';
import { TopBar } from '../components/TopBar';
import { LessonsTab } from '../components/LessonsTab';
import { DeleteClassDialog } from '../components/DeleteClassDialog';
import { AnnounceDialog } from '../components/AnnounceDialog';
import { useClassmates } from '../lib/learners';
import { LearnersTab } from '../components/LearnersTab';
import { ClassSettingsDialog } from '../components/ClassSettingsDialog';
import { Notebook } from '../components/Notebook';
import { Reports } from '../components/Reports';
import { useAuth } from '../lib/auth';

type Tab = 'lessons' | 'learners' | 'notebook' | 'reports';

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
  const navigate = useNavigate();
  const [c, setC] = useState<ClassDoc | null | undefined>(undefined);
  const roster = useClassmates(c?.classCode ?? undefined);
  const [params] = useSearchParams();
  const focusEntry = params.get('entry');
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'notebook' || focusEntry ? 'notebook' : 'lessons');
  const { user } = useAuth();
  const [resultsItem, setResultsItem] = useState<Item | null>(null);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'classes', classId),
        (s) => setC(s.exists() ? ({ id: s.id, ...(s.data() as Omit<ClassDoc, 'id'>) }) : null),
        () => setC(null),
      ),
    [classId],
  );

  const ok = !!c;
  const topics = useCollection<Topic>(['classes', classId, 'topics'], ok);
  const items = useCollection<Item>(['classes', classId, 'items'], ok);
  const learners = useCollection<Learner>(['classes', classId, 'learners'], ok);
  const secrets = useCollection<{ id: string; pin: string }>(['classes', classId, 'secrets'], ok);
  const pins = Object.fromEntries(secrets.map((s) => [s.id, s.pin]));

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
    if (!window.confirm(`Archive ${c.name}? Everything is kept and you can restore it later.`)) return;
    await updateClass(c, { status: 'archived' });
    navigate('/');
  }

  return (
    <div className="shell" style={style}>
      <TopBar>
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link to="/">Classes</Link>
          <span aria-hidden="true">/</span>
          <span className="here">{c?.name ?? '…'}</span>
        </nav>
      </TopBar>

      {c === null && <p className="placeholder">This class could not be found, or you don’t have access to it.</p>}
      {c === undefined && <span className="sub">Loading…</span>}

      {c && (
        <>
          <div className="row-between" style={{ alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h1 className="page-title">{c.name}</h1>
              <div className="class-meta">
                <span>
                  {c.level} · {learners.length} {learners.length === 1 ? 'learner' : 'learners'}
                  {c.status === 'archived' ? ' · archived' : ''}
                </span>
                <span className="code-chip">
                  Class code <strong>{c.classCode}</strong>
                  <button type="button" onClick={copyCode}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </span>
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
                  <button role="menuitem" className="danger-item" onClick={() => (setMenu(false), setDeleting(true))}>
                    Delete class…
                  </button>
                </div>
              )}
            </div>
          </div>

          {announcing && <AnnounceDialog classId={c.id} roster={roster} onClose={() => setAnnouncing(false)} />}
          {deleting && <DeleteClassDialog c={c} onClose={() => setDeleting(false)} onDeleted={() => navigate('/')} />}
          <nav className="tabs" aria-label="Class sections">
            <button className={tab === 'lessons' ? 'on' : ''} onClick={() => setTab('lessons')}>
              Lessons and work
            </button>
            <button className={tab === 'learners' ? 'on' : ''} onClick={() => setTab('learners')}>
              Learners <span className="count">{learners.length}</span>
            </button>
            <button className={tab === 'notebook' ? 'on' : ''} onClick={() => setTab('notebook')}>
              Notebook
            </button>
            <button className={tab === 'reports' ? 'on' : ''} onClick={() => (setResultsItem(null), setTab('reports'))}>
              Reports
            </button>
          </nav>

          {tab === 'lessons' ? (
            <LessonsTab c={c} topics={topics} items={items} onResults={(i) => (setResultsItem(i), setTab('reports'))} />
          ) : tab === 'learners' ? (
            <LearnersTab c={c} learners={learners} pins={pins} />
          ) : tab === 'reports' ? (
            <Reports key={resultsItem?.id ?? 'all'} c={c} items={items} learners={learners} initialItem={resultsItem} />
          ) : (
            user && <Notebook classId={c.id} c={c} me={{ uid: user.uid, name: (user.displayName || 'Teacher').split(' ')[0], teacher: true }} items={[...items].sort((a, b) => a.order - b.order)} topics={[...topics].sort((a, b) => a.order - b.order)} roster={roster} focus={focusEntry} />
          )}
        </>
      )}

      {settings && c && <ClassSettingsDialog c={c} onClose={() => setSettings(false)} />}
    </div>
  );
}

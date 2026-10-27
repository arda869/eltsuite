import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { UiIcon } from '../components/UiIcon';
import { FileIcon, type FileKind } from '../components/FileIcon';
import { FolderIcon } from '../components/FileIcon';
import { Loader } from '../components/Loader';
import { openMenu, openMenuAt, type MenuItem } from '../components/ContextMenu';
import { ask, askText } from '../lib/ask';
import { useDrive, useMyOrg, type DriveFolder } from '../lib/admin';
import { KIND_LABEL, newDocInFolder, removeSharedDoc, renameDoc, useFolderDocs, type DocKind, type SharedDoc, type SharedFolder } from '../lib/sharedDocs';
import { CopyToClass, LESSON_TYPES } from '../lessons/LessonFile';

// The organisation library: the organisation's own lessons and materials, kept by its admins and
// the teachers they let edit. Teachers copy a lesson into one of their classes in one step.

type LType = NonNullable<SharedDoc['ltype']>;
const NEW: { label: string; kind: DocKind; ltype?: LType; hint: string }[] = [
  ...LESSON_TYPES.map((t) => ({ label: t.label, kind: 'lesson' as DocKind, ltype: t.v, hint: t.hint })),
  { label: 'Collab document', kind: 'doc', hint: 'Written together, live' },
  { label: 'Slides', kind: 'slides', hint: 'A deck to present' },
  { label: 'Flashcards', kind: 'flash', hint: 'A set of cards to study' },
  { label: 'PD reading', kind: 'pd', hint: 'Sources and notes for teachers' },
];

export function LibraryPage() {
  const { user, profile } = useAuth();
  const org = useMyOrg();
  const folders = useDrive(org);
  const [qs, setQs] = useSearchParams();
  const uid = user?.uid ?? '';
  const admin = !!org && !!user?.email && org.adminEmails.map((e) => e.toLowerCase()).includes(user.email.toLowerCase());
  // Admins see every folder; teachers the ones they may use.
  const mine = useMemo(() => (folders ?? []).filter((f) => admin || f.owner === uid || f.memberIds.includes(uid)).sort((a, b) => a.name.localeCompare(b.name)), [folders, admin, uid]);
  const sections = useMemo(() => {
    const d = { main: { name: 'Organisation library' }, ...(org?.drives ?? {}) } as Record<string, { name: string }>;
    return Object.entries(d)
      .map(([k, x]) => ({ k, name: x.name, folders: mine.filter((f) => (f.drive ?? 'main') === k) }))
      .filter((s) => s.folders.length);
  }, [org?.drives, mine]);
  const openId = qs.get('f') ?? mine[0]?.id ?? '';
  const open = mine.find((f) => f.id === openId) ?? null;

  if (org === undefined || (org && !folders)) return <Shell><Loader label="Opening the library" /></Shell>;
  if (!org)
    return (
      <Shell>
        <div className="lb-empty">
          <h1 className="page-title">Organisation library</h1>
          <span className="hint">The organisation library is for teachers in an organisation. Your organisation’s admins keep it.</span>
        </div>
      </Shell>
    );
  return (
    <Shell>
      <div className="lb">
        <aside className="lb-side" aria-label="Folders">
          <span className="lb-org">{org.name}</span>
          {sections.map((s) => (
            <nav key={s.k} className="lb-sec" aria-label={s.name}>
              {sections.length > 1 && <span className="ma-h">{s.name}</span>}
              {s.folders.map((f) => (
                <button key={f.id} type="button" className={'lb-f' + (f.id === open?.id ? ' on' : '')} aria-current={f.id === open?.id ? 'page' : undefined} onClick={() => setQs({ f: f.id }, { replace: true })}>
                  <FolderIcon size={18} />
                  <span>{f.name}</span>
                  <RoleTag f={f} uid={uid} />
                </button>
              ))}
            </nav>
          ))}
          {!sections.length && <span className="hint">No folders yet.</span>}
          {admin && (
            <Link to="/org-admin?tab=drives" className="btn link small lb-manage">
              Folders and who can use them
            </Link>
          )}
        </aside>
        <main className="lb-main">
          {open ? (
            <FolderPane key={open.id} f={open} uid={uid} me={{ uid, name: profile?.displayName || user?.displayName || 'Teacher' }} />
          ) : (
            <div className="lb-empty">
              <h1 className="page-title">Organisation library</h1>
              <span className="hint">{admin ? 'Add folders in Organisation admin, then lessons, documents and flashcards here.' : 'Nothing here yet. Your organisation’s admins add the folders.'}</span>
            </div>
          )}
        </main>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell lib-shell">
      <TopBar>
        <MainNav on="" />
      </TopBar>
      {children}
    </div>
  );
}

const roleOfFolder = (f: DriveFolder, uid: string) => (f.owner === uid ? 'edit' : ((f as DriveFolder & { members?: Record<string, { role: string }> }).members?.[uid]?.role ?? 'none'));
function RoleTag({ f, uid }: { f: DriveFolder; uid: string }) {
  const r = roleOfFolder(f, uid);
  return r === 'edit' ? null : <span className="lb-role">{r === 'none' ? 'Hidden' : r === 'comment' ? 'Comment' : 'View'}</span>;
}

function FolderPane({ f, uid, me }: { f: DriveFolder; uid: string; me: { uid: string; name: string } }) {
  const sf = f as unknown as SharedFolder;
  const docs = useFolderDocs(sf, uid);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | 'lesson' | 'other'>('');
  const [copying, setCopying] = useState<SharedDoc | null>(null);
  const canAdd = roleOfFolder(f, uid) === 'edit';
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (docs ?? [])
      .filter((d) => (!kind || (kind === 'lesson' ? d.kind === 'lesson' : d.kind !== 'lesson')) && (!s || d.title.toLowerCase().includes(s)))
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
  }, [docs, q, kind]);
  const make = async (n: (typeof NEW)[number]) => {
    const w = window.open('about:blank', '_blank');
    const id = await newDocInFolder(sf, me, n.kind, { ltype: n.ltype, title: n.ltype ? `Untitled ${n.label.toLowerCase()}` : undefined });
    if (w) w.location.href = `/doc/${id}`;
    else window.location.href = `/doc/${id}`;
  };
  const menuFor = (d: SharedDoc): MenuItem[] => [
    { label: 'Open', icon: 'next', onClick: () => window.open(`/doc/${d.id}`, '_blank') },
    ...(d.kind === 'lesson' ? [{ label: 'Copy to a class…', icon: 'copyall', onClick: () => setCopying(d) }] : []),
    ...(canAdd ? [{ label: 'Rename', icon: 'edit', onClick: () => void askText('New name', d.title, { ok: 'Rename' }).then((v) => typeof v === 'string' && v.trim() && void renameDoc(d.id, v)) } as MenuItem] : []),
    ...(d.owner === uid ? [{ label: 'Delete', icon: 'trash', danger: true, onClick: () => void ask(`Delete “${d.title}” for everyone?`, { ok: 'Delete' }).then((ok) => ok && void removeSharedDoc(d.id)) } as MenuItem] : []),
  ];
  return (
    <section className="lb-pane">
      <div className="lb-head">
        <h1 className="page-title">{f.name}</h1>
        {canAdd && (
          <button type="button" className="btn primary" onClick={(e) => openMenuAt(e.currentTarget, NEW.flatMap((n, i): MenuItem[] => [...(i === LESSON_TYPES.length ? (['sep'] as MenuItem[]) : []), { label: n.label, hint: n.hint, icon: '', onClick: () => void make(n) }]))}>
            + New
          </button>
        )}
      </div>
      <span className="hint">{canAdd ? 'You can add and change files here. Teachers copy lessons into their classes; their copy is theirs to change.' : 'Open anything to read it. Copy a lesson into one of your classes to teach it; your copy is yours to change.'}</span>
      <div className="lb-tools">
        <span className="ma-search-wrap">
          <UiIcon name="search" size={15} />
          <input className="ma-search" type="search" value={q} placeholder={`Search in ${f.name}`} onChange={(e) => setQ(e.target.value)} />
        </span>
        <span className="seg small-seg" role="radiogroup" aria-label="Show">
          {([['', 'Everything'], ['lesson', 'Lessons'], ['other', 'Other files']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </span>
      </div>
      {docs === null ? (
        <Loader label="" />
      ) : shown.length ? (
        <div className="lb-grid">
          {shown.map((d) => (
            <div key={d.id} className="lb-card" onContextMenu={(e) => openMenu(e, menuFor(d))}>
              <a href={`/doc/${d.id}`} target="_blank" rel="noopener" className="lb-open">
                <FileIcon kind={d.kind as FileKind} sub={d.ltype} size={44} />
                <span className="lb-t">
                  <b>{d.title}</b>
                  <span className="hint">{d.kind === 'lesson' ? LESSON_TYPES.find((t) => t.v === (d.ltype ?? 'lesson'))?.label : KIND_LABEL[d.kind]}</span>
                </span>
              </a>
              {d.kind === 'lesson' && (
                <button type="button" className="btn small-btn lb-copy" onClick={() => setCopying(d)}>
                  <UiIcon name="copyall" size={14} /> Copy to a class
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <span className="hint lb-none">{q || kind ? 'Nothing matches.' : canAdd ? 'Nothing here yet. Use + New to add a lesson.' : 'Nothing here yet.'}</span>
      )}
      {copying && <CopyToClass docId={copying.id} title={copying.title} type={copying.ltype} onClose={() => setCopying(null)} />}
    </section>
  );
}

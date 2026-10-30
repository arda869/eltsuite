import { useEffect, useMemo, useState } from 'react';
import { stepFrom } from './MediaArchive';
import { Navigate, useSearchParams } from 'react-router-dom';
import { UiIcon } from '../components/UiIcon';
import { FileIcon, type FileKind } from '../components/FileIcon';
import { Loader } from '../components/Loader';
import { openMenu, openMenuAt, type MenuItem } from '../components/ContextMenu';
import { ask, askText } from '../lib/ask';
import { currentOrg, libName, type DriveFolder } from '../lib/admin';
import { KIND_LABEL, newDocInFolder, removeSharedDoc, renameDoc, useFolderDocs, type DocKind, type SharedDoc, type SharedFolder } from '../lib/sharedDocs';
import { CopyToClass, LESSON_TYPES } from '../lessons/LessonFile';
import { copyFile } from '../lib/copyFile';

// The organisation library: the organisation's own lessons and materials, kept by its admins and
// the teachers they let edit. Teachers copy a lesson into one of their classes in one step.

type LType = NonNullable<SharedDoc['ltype']>;
const NEW: { label: string; kind: DocKind; ltype?: LType; hint: string }[] = [
  ...LESSON_TYPES.map((t) => ({ label: t.label, kind: 'lesson' as DocKind, ltype: t.v, hint: t.hint })),
  { label: 'Collab document', kind: 'doc', hint: 'Written together, live' },
  { label: 'Slides', kind: 'slides', hint: 'A deck to present' },
  { label: 'Flashcards', kind: 'flash', hint: 'A set of cards to study' },
  { label: 'Reading Journal', kind: 'pd', hint: 'Sources and notes for teachers' },
];

export function LibraryPage() {
  const [qs] = useSearchParams();
  return <Navigate to={'/archive?library=' + encodeURIComponent(qs.get('f') || '')} replace />;
}


const roleOfFolder = (f: DriveFolder, uid: string) => (f.owner === uid ? 'edit' : ((f as DriveFolder & { members?: Record<string, { role: string }> }).members?.[uid]?.role ?? 'none'));

export function FolderPane({ f, uid, me }: { f: DriveFolder; uid: string; me: { uid: string; name: string } }) {
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
  const [note, setNote] = useState('');
  const toMine = async (d: SharedDoc) => {
    setNote(`Copying ${d.title}…`);
    try {
      await copyFile(d, me, null);
      setNote(`${d.title} is in your Resources now.`);
    } catch (e) {
      console.error(e);
      setNote('We couldn’t make the copy. Check how much space you have left, then try again.');
    }
  };
  const menuFor = (d: SharedDoc): MenuItem[] => [
    { label: 'Open', icon: 'next', onClick: () => window.open(`/doc/${d.id}`, '_blank') },
    { label: 'Copy to Personal files', icon: 'copyall', onClick: () => void toMine(d) },
    ...(d.kind === 'lesson' ? [{ label: 'Copy to a class…', icon: 'copyall', onClick: () => setCopying(d) }] : []),
    ...(canAdd ? [{ label: 'Rename', icon: 'edit', onClick: () => void askText('New name', d.title, { ok: 'Rename' }).then((v) => typeof v === 'string' && v.trim() && void renameDoc(d.id, v).catch((e) => { void import('../lib/ask').then(({ tell }) => tell(e.message)); })) } as MenuItem] : []),
    ...(d.owner === uid ? [{ label: 'Delete', icon: 'trash', danger: true, onClick: () => void ask(`Delete “${d.title}” to the recycle bin? It can be restored for 30 days.`, { ok: 'Delete' }).then((ok) => ok && void removeSharedDoc(d.id)) } as MenuItem] : []),
  ];
  const [pick, setPick] = useState('');
  const chosen = shown.find((d) => d.id === pick) ?? null;
  // Arrows move between files; Enter opens the one chosen.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, .scrim')) return;
      const ids = shown.map((d) => d.id);
      if (e.key.startsWith('Arrow') && ids.length) {
        e.preventDefault();
        const to = pick && ids.includes(pick) ? stepFrom(ids, pick, e.key) : ids[0];
        setPick(to);
        document.querySelector(`[data-sel="${CSS.escape(to)}"]`)?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && chosen) window.open(`/doc/${chosen.id}`, '_blank');
      else if (e.key === 'Escape') setPick('');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  return (
    <>
      <div className="ma-head">
        <div className="ma-head-text">
          <nav className="ma-crumbs" aria-label="Where you are">
            <button type="button" className="">
              {libName(currentOrg())}
            </button>
            <span className="ma-crumb">
              <span className="ma-crumb-sep" aria-hidden="true">›</span>
              <button type="button" className="here">
                {f.name}
              </button>
            </span>
          </nav>
          <h1 className="page-title">{f.name}</h1>
        </div>
        {canAdd && (
          <span className="ma-add">
            <button type="button" className="btn primary" aria-haspopup="menu" onClick={(e) => openMenuAt(e.currentTarget, NEW.flatMap((n, i): MenuItem[] => [...(i === LESSON_TYPES.length ? (['sep'] as MenuItem[]) : []), { label: n.label, hint: n.hint, icon: '', onClick: () => void make(n) }]))}>
              + New
            </button>
          </span>
        )}
      </div>
      <div className="ma-toolwrap">
        {chosen && (
          <div className="ma-selbar">
            <b>1 selected</b>
            <a className="btn small-btn" href={`/doc/${chosen.id}`} target="_blank" rel="noopener">
              <UiIcon name="fullscreen" size={14} /> Open
            </a>
            {chosen.kind === 'lesson' && (
              <button type="button" className="btn small-btn" onClick={() => setCopying(chosen)}>
                <UiIcon name="copyall" size={14} /> Copy to a class
              </button>
            )}
            <button type="button" className="btn small-btn" onClick={() => void toMine(chosen)}>
              <UiIcon name="archive" size={14} /> Copy to My files
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn link small" onClick={() => setPick('')}>
              Clear
            </button>
          </div>
        )}
        <div className={'ma-bar-row ma-tools' + (chosen ? ' under' : '')} aria-hidden={chosen ? true : undefined}>
          <span className="ma-search-wrap">
            <UiIcon name="search" size={15} />
            <input aria-label={`Search in ${f.name}`} className="ma-search" type="search" value={q} placeholder={`Search in ${f.name}`} onChange={(e) => setQ(e.target.value)} />
          </span>
          <span className="seg small-seg" role="radiogroup" aria-label="Show">
            {([['', 'Everything'], ['lesson', 'Lessons'], ['other', 'Other files']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {l}
              </button>
            ))}
          </span>
        </div>
      </div>
      {note && (
        <span className="hint lb-note" role="status">
          {note}
        </span>
      )}
      <div className="ma-files" onClick={(e) => e.target === e.currentTarget && setPick('')}>
        {docs === null ? (
          <Loader label="" />
        ) : shown.length ? (
          <div className="ma-grid">
            {shown.map((d) => (
              <button
                key={d.id}
                type="button"
                data-sel={d.id}
                className={'ma-card' + (pick === d.id ? ' chosen' : '')}
                onClick={() => setPick(d.id)}
                onDoubleClick={() => window.open(`/doc/${d.id}`, '_blank')}
                onContextMenu={(e) => (setPick(d.id), openMenu(e, menuFor(d)))}
                title={d.kind === 'lesson' ? LESSON_TYPES.find((t) => t.v === (d.ltype ?? 'lesson'))?.label : KIND_LABEL[d.kind]}
              >
                <span className={'ma-thumb k-' + d.kind}>
                  <FileIcon kind={d.kind as FileKind} sub={d.ltype} size={42} />
                </span>
                <span className="ma-name">{d.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="ma-empty">
            <span className="hint">{q || kind ? 'Nothing matches.' : canAdd ? 'Nothing here yet. Use + New to add a lesson.' : 'Nothing here yet.'}</span>
          </div>
        )}
      </div>
      {copying && <CopyToClass docId={copying.id} title={copying.title} type={copying.ltype} onClose={() => setCopying(null)} />}
    </>
  );
}

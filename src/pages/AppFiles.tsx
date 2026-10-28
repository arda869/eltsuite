import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { Loader } from '../components/Loader';
import { FileIcon, type FileKind } from '../components/FileIcon';
import { openMenu, type MenuItem } from '../components/ContextMenu';
import { ask, tell } from '../lib/ask';
import { libName, useDrive, useMyOrg } from '../lib/admin';
import { KIND_LABEL, newSharedDoc, removeSharedDoc, useMyDocs, type DocKind, type SharedDoc } from '../lib/sharedDocs';
import { useArchive, type ArchiveItem } from '../lib/archive';
import { useStars, setStar } from '../lib/stars';
import { MediaDialog } from '../media/MediaDialog';
import { MAX_PDF, openPdf, pageSizes, saveFilePdf } from '../pdf/pdfData';

// Collab, Reading Journal, PDF and Recordings as apps of their own, the way Docs and Slides are
// apps in Google's suite as well as being in Drive: each lists the teacher's own files of that
// kind, the ones shared with them, the ones in their organisation's library, and the starred ones.

export type AppKey = 'collab' | 'reading' | 'pdf' | 'recordings';
type Tab = 'mine' | 'shared' | 'library' | 'starred';
type Entry = { id: string; star: string; title: string; kind: FileKind; who: string; at: number; open: () => void; doc?: SharedDoc };

const APP: Record<AppKey, { name: string; kinds: DocKind[]; color: string; empty: string }> = {
  collab: { name: 'Collab', kinds: ['doc', 'slides'], color: '#3667a6', empty: 'Documents and slides you write together, live, with colleagues or learners.' },
  reading: { name: 'Reading Journal', kinds: ['pd'], color: '#6b5a8a', empty: 'The books and articles you read, with your notes and citations.' },
  pdf: { name: 'PDF', kinds: ['pdf'], color: '#a6463a', empty: 'PDFs to write on, on your own or with others.' },
  recordings: { name: 'Recordings', kinds: [], color: '#3b7f7a', empty: 'Recordings you make or upload, with scripts, to use in any lesson.' },
};
const ms = (d: SharedDoc) => d.updatedAt?.toMillis?.() ?? 0;
const when = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '');
const openDoc = (id: string) => window.open(`/doc/${id}`, '_blank');

export function AppFiles({ app }: { app: AppKey }) {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const a = APP[app];
  const { mine, withMe } = useMyDocs(uid || undefined);
  const archive = useArchive(app === 'recordings' ? uid : null);
  const org = useMyOrg();
  const drives = useDrive(org);
  const stars = useStars(uid);
  const [tab, setTab] = useState<Tab>('mine');
  const [q, setQ] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState('');
  const pdfIn = useRef<HTMLInputElement>(null);
  const inLib = useMemo(() => new Set((drives ?? []).map((f) => f.id)), [drives]);

  const lists = useMemo(() => {
    const ofDoc = (d: SharedDoc): Entry => ({ id: d.id, star: d.id, title: d.title, kind: d.kind as FileKind, who: d.owner === uid ? '' : d.ownerName, at: ms(d), open: () => openDoc(d.id), doc: d });
    const ofRec = (r: ArchiveItem): Entry => ({ id: 'a:' + r.id, star: 'a:' + r.id, title: r.name, kind: 'audio', who: '', at: r.updatedAt ?? r.createdAt, open: () => (r.home && !r.link ? window.open(`/studio/sound/${r.id}`, '_blank') : void window.open('/archive', '_self')) });
    const fit = (d: SharedDoc) => a.kinds.includes(d.kind);
    const own = app === 'recordings' ? (archive ?? []).filter((r) => r.kind === 'audio').map(ofRec) : (mine ?? []).filter((d) => fit(d) && !(d.folder && inLib.has(d.folder))).map(ofDoc);
    const shared = (withMe ?? []).filter((d) => fit(d) && !(d.folder && inLib.has(d.folder))).map(ofDoc);
    const library = [...(mine ?? []), ...(withMe ?? [])].filter((d) => fit(d) && !!d.folder && inLib.has(d.folder)).map(ofDoc);
    const every = new Map([...own, ...shared, ...library].map((e) => [e.star, e]));
    const starred = Object.entries(stars)
      .sort((x, y) => y[1] - x[1])
      .map(([k]) => every.get(k))
      .filter((e): e is Entry => !!e);
    const by = (l: Entry[]) => l.sort((x, y) => y.at - x.at);
    return { mine: by(own), shared: by(shared), library: by(library), starred };
  }, [mine, withMe, archive, stars, inLib, a, app, uid]);

  const loading = app === 'recordings' ? archive === null : mine === null || withMe === null;
  const s = q.trim().toLowerCase();
  const shown = lists[tab].filter((e) => !s || `${e.title} ${e.who}`.toLowerCase().includes(s));
  const tabs: [Tab, string][] = [
    ['mine', 'My files'],
    ['shared', 'Shared with me'],
    ...(org ? ([['library', libName(org)]] as [Tab, string][]) : []),
    ['starred', 'Starred'],
  ];

  const make = async (k: DocKind) => {
    if (!uid) return;
    const w = window.open('about:blank', '_blank');
    const id = await newSharedDoc({ uid, name: user?.displayName || 'Teacher' }, k);
    if (w) w.location.href = `/doc/${id}`;
  };
  const makePdf = async (f: File) => {
    if (!uid) return;
    if (f.size > MAX_PDF) return void tell('That PDF is larger than 15 MB. Make it smaller first, for example by saving it with smaller pictures.');
    const w = window.open('about:blank', '_blank');
    setBusy('Uploading ' + f.name + '…');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const pages = await pageSizes(await openPdf(bytes));
      const id = await newSharedDoc({ uid, name: user?.displayName || 'Teacher' }, 'pdf', f.name.replace(/\.pdf$/i, ''));
      await saveFilePdf(id, bytes, pages);
      if (w) w.location.href = `/doc/${id}`;
    } catch {
      w?.close();
      void tell('That file could not be opened as a PDF.');
    } finally {
      setBusy('');
    }
  };
  const news: { label: string; run: () => void }[] =
    app === 'collab'
      ? [
          { label: 'New document', run: () => void make('doc') },
          { label: 'New slides', run: () => void make('slides') },
        ]
      : app === 'reading'
        ? [{ label: 'New reading journal', run: () => void make('pd') }]
        : app === 'pdf'
          ? [{ label: 'Upload a PDF', run: () => pdfIn.current?.click() }]
          : [
              { label: 'Record', run: () => setRecording(true) },
            ];

  const menuFor = (e: Entry): MenuItem[] => [
    { label: 'Open', onClick: e.open },
    { label: stars[e.star] ? 'Remove the star' : 'Star', onClick: () => void setStar(uid, e.star, !stars[e.star]) },
    ...(e.doc && e.doc.owner === uid && !(e.doc.folder && inLib.has(e.doc.folder))
      ? ['sep' as const, { label: 'Delete', danger: true, onClick: () => void ask(`Delete “${e.title}” for everyone it is shared with?`).then((ok) => void (ok && removeSharedDoc(e.doc!.id))) }]
      : []),
  ];

  return (
    <div className="shell af-shell" style={{ ['--app' as string]: a.color }}>
      <TopBar>
        <MainNav on="" />
      </TopBar>
      <main className="af">
        <header className="af-head">
          <h1 className="page-title">{a.name}</h1>
          <span className="af-grow" />
          {news.map((n, i) => (
            <button key={n.label} type="button" className={'btn ' + (i ? 'ghost' : 'primary')} onClick={n.run}>
              + {n.label}
            </button>
          ))}
        </header>
        <div className="af-bar">
          <span className="seg af-tabs" role="tablist" aria-label="Which files">
            {tabs.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {label}
                {k !== 'mine' && lists[k].length > 0 && <span className="af-n">{lists[k].length}</span>}
              </button>
            ))}
          </span>
          <input className="af-q" type="search" placeholder="Search" aria-label={`Search ${a.name}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {busy && <span className="hint" role="status">{busy}</span>}
        {loading ? (
          <Loader label={`Opening ${a.name}`} />
        ) : shown.length ? (
          <ul className="af-list">
            {shown.map((e) => (
              <li key={e.id} className="af-row" onContextMenu={(ev) => openMenu(ev, menuFor(e))}>
                <button type="button" className="af-open" onClick={e.open}>
                  <FileIcon kind={e.kind} size={30} label={false} />
                  <span className="af-t">
                    <b>{e.title}</b>
                    <span>
                      {e.kind === 'audio' ? 'Recording' : KIND_LABEL[e.kind as DocKind]}
                      {e.who ? ` · From ${e.who}` : ''}
                    </span>
                  </span>
                  <span className="af-when">{when(e.at)}</span>
                </button>
                <button type="button" className={'af-star' + (stars[e.star] ? ' on' : '')} aria-pressed={!!stars[e.star]} aria-label={stars[e.star] ? `Remove the star from ${e.title}` : `Star ${e.title}`} data-tip={stars[e.star] ? 'Starred' : 'Star'} onClick={() => void setStar(uid, e.star, !stars[e.star])}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z" fill={stars[e.star] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="af-empty">
            <span className="af-empty-ico">
              <FileIcon kind={app === 'recordings' ? 'audio' : (a.kinds[0] as FileKind)} size={44} label={false} />
            </span>
            <strong>{s ? 'Nothing matches' : tab === 'starred' ? 'Nothing starred yet' : tab === 'shared' ? 'Nothing shared with you yet' : tab === 'library' ? 'Nothing in the library yet' : `No ${a.name} files yet`}</strong>
            <span className="hint">{s ? 'Try other words.' : tab === 'starred' ? 'Star a file to find it here quickly.' : tab === 'library' && app === 'recordings' ? 'Recordings are not kept in the library yet.' : a.empty}</span>
          </div>
        )}
      </main>
      <input ref={pdfIn} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (e.target.files?.[0] && void makePdf(e.target.files[0]), (e.target.value = ''))} />
      {recording && uid && <MediaDialog classId={'user:' + uid} tab="record" noArchive onClose={() => setRecording(false)} onPick={() => setRecording(false)} />}
    </div>
  );
}

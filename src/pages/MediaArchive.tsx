import { usePhone } from '../lib/useMedia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveDocs, ArchiveShared, ArchiveTasks } from './ArchiveLibrary';
import { ShareDialog } from '../components/ShareDialog';
import { Link, Navigate } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { UiIcon } from '../components/UiIcon';
import { Loader } from '../components/Loader';
import { useAuth } from '../lib/auth';
import { addFolder, archiveRemove, archiveUpdate, downloadItem, downloadZip, findUses, formatBytes, inTree, leafOf, loadManifest, moveItems, parentOf, removeFolder, renameFolder, replaceSound, soundUrl, useArchive, useFolders, type ArchiveItem } from '../lib/archive';
import { useMyShares } from '../lib/sharing';
import { openMenu, type MenuItem } from '../components/ContextMenu';
import { SoundEditor, type SoundSource } from '../media/SoundEditor';
import { decodeSound } from '../lib/sound';
import { createPortal } from 'react-dom';
import { useImageSrc } from '../editor/PackNode';
import { MediaPlayer } from '../media/Player';
import { ScriptEditor } from '../media/ScriptEditor';
import { fmtTime } from '../lib/sound';
import { MediaDialog, type MediaTab } from '../media/MediaDialog';
import { FileIcon, FolderIcon } from '../components/FileIcon';
import { ask, askText } from '../lib/ask';
import { uploadPicture, type PicQuality } from '../editor/PackNode';

// The resources library: every picture, sound and video the teacher has added, to use again in any
// lesson. Folders and tags to keep it in order, the space it takes, and karaoke scripts that are
// edited once here and change in every lesson that uses them.

const FREE = 1024 * 1024 * 1024;
const KINDS = [
  { k: 'image', label: 'Pictures', icon: 'picture' },
  { k: 'audio', label: 'Sounds', icon: 'music' },
  { k: 'video', label: 'Videos', icon: 'video' },
] as const;
type Sort = 'new' | 'name' | 'size';
type View = 'icons' | 'list' | 'time';
const VIEWS: { k: View; label: string }[] = [
  { k: 'icons', label: 'Icons' },
  { k: 'list', label: 'List' },
  { k: 'time', label: 'Timeline' },
];
const MOVE = 'application/x-ll-media';
const monthOf = (t: number) => (t ? new Date(t).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'Earlier');
const dayOf = (t: number) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const nItems = (n: number) => (n === 1 ? '1 item' : `${n} items`);
const kindName = (k: string) => (k === 'image' ? 'Picture' : k === 'video' ? 'Video' : 'Sound');

// The space an item takes: its size in each class that has a copy.
const spaceOf = (i: ArchiveItem) => (i.size || 0) * (1 + Object.keys(i.copies ?? {}).filter((c) => c !== i.home?.classId).length) + (i.thumb?.length ?? 0);

type Section = 'media' | 'tasks' | 'docs' | 'shared' | 'colleagues';

export function MediaArchive() {
  const { user } = useAuth();
  const uid = user?.uid;
  const phone = usePhone();
  const touch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
  const [section, setSection] = useState<Section>(() => (new URLSearchParams(window.location.search).get('show') as Section) || 'media');
  const pick = (k: Section) => {
    setSection(k);
    window.history.replaceState(null, '', k === 'media' ? '/archive' : `/archive?show=${k}`);
  };
  const items = useArchive(uid);
  const markers = useFolders(uid);
  const shares = useMyShares(uid);
  const sharedIds = useMemo(() => new Set((shares ?? []).map((s) => s.src?.archiveId).filter(Boolean) as string[]), [shares]);
  const [folder, setFolder] = useState(''); // '' is the library itself
  const [kind, setKind] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setViewS] = useState<View>(() => {
    try {
      return (localStorage.getItem('ll.maView') as View) || 'icons';
    } catch {
      return 'icons';
    }
  });
  const setView = (v: View) => {
    setViewS(v);
    try {
      localStorage.setItem('ll.maView', v);
    } catch {
      /* fine */
    }
  };
  const [dialog, setDialog] = useState<{ tab: MediaTab; file?: File } | null>(null);
  const [upBusy, setUpBusy] = useState('');
  const [over, setOver] = useState(false);
  const [moving, setMoving] = useState<ArchiveItem[] | null>(null);
  const space = uid ? 'user:' + uid : '';
  const quality = (): PicQuality => {
    try {
      const v = localStorage.getItem('ll.picQuality');
      return v === 'high' || v === 'small' ? v : 'standard';
    } catch {
      return 'standard';
    }
  };
  const addPictures = async (pics: File[]) => {
    if (!pics.length || !space) return;
    setUpBusy(pics.length > 1 ? `Adding ${pics.length} pictures…` : 'Adding the picture…');
    try {
      for (const f of pics) await uploadPicture(space, f, quality(), undefined, folder);
      setUpBusy('');
    } catch {
      setUpBusy('A picture could not be added. Try a smaller one.');
    }
  };
  // Pictures go straight in; a sound opens the editor first.
  const addFiles = (list: FileList | File[]) => {
    const files = Array.from(list);
    void addPictures(files.filter((f) => f.type.startsWith('image/')));
    const sound = files.find((f) => f.type.startsWith('audio/') || f.type.startsWith('video/'));
    if (sound) setDialog({ tab: 'upload', file: sound });
  };

  const all = items ?? [];
  // Every folder, with the folders above it.
  const allFolders = useMemo(() => {
    const set = new Set<string>();
    [...markers, ...all.map((i) => i.folder)].filter(Boolean).forEach((f) => {
      const parts = f.split('/');
      parts.forEach((_, k) => set.add(parts.slice(0, k + 1).join('/')));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [markers, all]);
  const kidsOf = (f: string) => allFolders.filter((x) => parentOf(x) === f);
  const countIn = (f: string) => all.filter((i) => inTree(i.folder, f)).length;
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((i) => i.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);
  const filtering = !!q.trim() || !!kind || !!tag;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    // Searching looks through this folder and the folders in it; otherwise just this folder.
    const list = all
      .filter((i) => (filtering || view === 'time' ? inTree(i.folder, folder) : i.folder === folder))
      .filter((i) => !kind || i.kind === kind)
      .filter((i) => !tag || i.tags.includes(tag))
      .filter((i) => !s || `${i.name} ${i.tags.join(' ')} ${(i.script ?? []).map((l) => l.text).join(' ')}`.toLowerCase().includes(s));
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : sort === 'size' ? [...list].sort((a, b) => spaceOf(b) - spaceOf(a)) : [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [all, folder, kind, tag, q, sort, filtering, view]);
  const subFolders = filtering || view === 'time' ? [] : kidsOf(folder);
  const total = all.reduce((s, i) => s + spaceOf(i), 0);
  const open = all.find((i) => i.id === openId) ?? null;

  // ---------------------------------------------------------------- choosing several
  // Click chooses one, Ctrl/Cmd or Shift click adds, and dragging on the empty space draws a box
  // that chooses what it touches. Folders are chosen as 'f:' + path.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const order = [...subFolders.map((f) => 'f:' + f), ...shown.map((i) => i.id)];
  useEffect(() => setSel(new Set()), [folder, kind, tag, q, section]);
  const choose = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const a = order.indexOf(anchor.current);
      const b = order.indexOf(id);
      if (a >= 0 && b >= 0) return setSel(new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1)));
    }
    anchor.current = id;
    if (e.metaKey || e.ctrlKey) return setSel((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
    setSel(new Set([id]));
  };
  const selItems = shown.filter((i) => sel.has(i.id));
  const selFolders = subFolders.filter((f) => sel.has('f:' + f));
  const filesRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marquee = (e: React.PointerEvent) => {
    if (e.button !== 0 || touch) return;
    if ((e.target as HTMLElement).closest('[data-sel], button, a, input, select, .ma-selbar')) return;
    const host = filesRef.current;
    if (!host) return;
    e.preventDefault();
    const hr = host.getBoundingClientRect();
    const x0 = e.clientX - hr.left + host.scrollLeft;
    const y0 = e.clientY - hr.top + host.scrollTop;
    const keep = e.metaKey || e.ctrlKey || e.shiftKey ? new Set(sel) : new Set<string>();
    if (!keep.size) setSel(new Set());
    let moved = false;
    const mv = (ev: PointerEvent) => {
      const x1 = ev.clientX - hr.left + host.scrollLeft;
      const y1 = ev.clientY - hr.top + host.scrollTop;
      if (!moved && Math.hypot(x1 - x0, y1 - y0) < 4) return;
      moved = true;
      const r = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      setBox(r);
      const next = new Set(keep);
      host.querySelectorAll<HTMLElement>('[data-sel]').forEach((el) => {
        const er = el.getBoundingClientRect();
        const ex = er.left - hr.left + host.scrollLeft;
        const ey = er.top - hr.top + host.scrollTop;
        if (ex < r.x + r.w && ex + er.width > r.x && ey < r.y + r.h && ey + er.height > r.y) next.add(el.dataset.sel!);
      });
      setSel(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setBox(null);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (section !== 'media' || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') e.preventDefault(), setSel(new Set(order));
      if (e.key === 'Escape') setSel(new Set());
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // ---------------------------------------------------------------- actions
  const [busy, setBusy] = useState('');
  const newFolder = async (inside = folder) => {
    const n = (await askText(inside ? `New folder in “${leafOf(inside)}”` : 'Name the new folder', '', { ok: 'Make the folder' }))?.trim().replace(/\//g, '-');
    if (!n || !uid) return;
    const path = inside ? `${inside}/${n}` : n;
    await addFolder(uid, path).catch(() => {});
  };
  const renameF = async (f: string) => {
    const n = (await askText('Rename the folder', leafOf(f), { ok: 'Rename' }))?.trim().replace(/\//g, '-');
    if (!n || !uid || n === leafOf(f)) return;
    const to = parentOf(f) ? `${parentOf(f)}/${n}` : n;
    await renameFolder(uid, f, to, all, allFolders).catch(() => {});
    if (inTree(folder, f)) setFolder(to + folder.slice(f.length));
  };
  const deleteF = async (f: string) => {
    const n = countIn(f);
    if (!(await ask(`Delete the folder “${leafOf(f)}”? ${n ? `The ${n === 1 ? 'item' : `${n} items`} in it move up to ${parentOf(f) ? `“${leafOf(parentOf(f))}”` : 'the library'}.` : 'It is empty.'}`, { ok: 'Delete the folder' }))) return;
    if (uid) await removeFolder(uid, f, all, allFolders).catch(() => {});
    if (inTree(folder, f)) setFolder(parentOf(f));
  };
  const renameI = async (it: ArchiveItem) => {
    const n = (await askText('Rename', it.name, { ok: 'Rename' }))?.trim();
    if (n && uid && n !== it.name) await archiveUpdate(uid, it, { name: n }).catch(() => {});
  };
  const removeI = async (list: ArchiveItem[]) => {
    if (!list.length || !uid) return;
    if (!(await ask(list.length === 1 ? `Remove “${list[0].name}” from the library? Lessons that use it keep it.` : `Remove ${list.length} items from the library? Lessons that use them keep them.`, { ok: 'Remove' }))) return;
    for (const it of list) await archiveRemove(uid, it.id).catch(() => {});
    setSel(new Set());
    if (list.some((i) => i.id === openId)) setOpenId(null);
  };
  const download = async (list: ArchiveItem[], folders: string[] = [], name = '') => {
    const every = [...new Map([...list, ...all.filter((i) => folders.some((f) => inTree(i.folder, f)))].map((i) => [i.id, i])).values()];
    if (!every.length) return;
    if (every.length === 1 && !folders.length) return void downloadItem(every[0]).catch(() => {});
    setBusy('Putting the files together…');
    try {
      await downloadZip(every, name || (folders.length === 1 && !list.length ? leafOf(folders[0]) : folder ? leafOf(folder) : 'Resources'), folders.length === 1 && !list.length ? folders[0] : folder, (d, t) => setBusy(`Putting the files together… ${d} of ${t}`));
      setBusy('');
    } catch {
      setBusy('The download could not be made. Try fewer items.');
    }
  };
  const moveTo = async (list: ArchiveItem[], to: string) => {
    if (uid && list.length) await moveItems(uid, list, to).catch(() => {});
    setSel(new Set());
  };
  // Drag items onto a folder (in the pane or in the list) to move them there.
  const [dropOn, setDropOn] = useState<string | null>(null);
  const folderDrop = (f: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(MOVE)) return;
      e.preventDefault();
      setDropOn(f);
    },
    onDragLeave: () => setDropOn((d) => (d === f ? null : d)),
    onDrop: (e: React.DragEvent) => {
      const ids = (e.dataTransfer.getData(MOVE) || '').split(',').filter(Boolean);
      if (!ids.length) return;
      e.preventDefault();
      e.stopPropagation();
      setDropOn(null);
      void moveTo(all.filter((i) => ids.includes(i.id) && i.folder !== f), f);
    },
  });
  const dragItem = (it: ArchiveItem) => (e: React.DragEvent) => {
    const ids = sel.has(it.id) ? selItems.map((i) => i.id) : [it.id];
    e.dataTransfer.setData(MOVE, ids.join(','));
    e.dataTransfer.effectAllowed = 'move';
  };
  const itemMenu = (it: ArchiveItem): MenuItem[] => {
    const many = sel.has(it.id) && sel.size > 1 ? selItems : null;
    if (many)
      return [
        { label: `Move ${many.length} items to…`, icon: 'folder', onClick: () => setMoving(many) },
        { label: `Download ${many.length} items`, icon: 'import', onClick: () => void download(many, selFolders) },
        'sep',
        { label: `Remove ${many.length} items`, icon: 'trash', danger: true, onClick: () => void removeI(many) },
      ];
    return [
      { label: 'Open', icon: 'fullscreen', onClick: () => setOpenId(it.id) },
      { label: 'Rename', icon: 'edit', onClick: () => void renameI(it) },
      { label: 'Move to…', icon: 'folder', onClick: () => setMoving([it]) },
      { label: it.link ? 'Open the link' : 'Download', icon: it.link ? 'link' : 'import', hint: it.script?.length ? '+ transcript' : undefined, onClick: () => void downloadItem(it).catch(() => {}) },
      'sep',
      { label: 'Remove from the library', icon: 'trash', danger: true, onClick: () => void removeI([it]) },
    ];
  };
  const folderMenu = (f: string): MenuItem[] => [
    { label: 'Open', icon: 'folder', onClick: () => setFolder(f) },
    { label: 'New folder inside', icon: 'plus', onClick: () => void newFolder(f) },
    { label: 'Rename', icon: 'edit', onClick: () => void renameF(f) },
    { label: 'Download everything in it', icon: 'import', disabled: !countIn(f), onClick: () => void download([], [f]) },
    'sep',
    { label: 'Delete the folder', icon: 'trash', danger: true, onClick: () => void deleteF(f) },
  ];
  const emptyMenu: MenuItem[] = [
    { label: 'Add media…', icon: 'upload', onClick: () => setDialog({ tab: 'upload' }) },
    { label: 'New folder', icon: 'folder', onClick: () => void newFolder() },
    ...(order.length ? [{ label: 'Choose everything', icon: 'check', onClick: () => setSel(new Set(order)) } as MenuItem] : []),
  ];
  const clickFolder = (f: string) => (e: React.MouseEvent) => (touch || phone ? setFolder(f) : choose('f:' + f, e));
  const clickItem = (it: ArchiveItem) => (e: React.MouseEvent) => {
    choose(it.id, e);
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey) setOpenId(it.id);
  };
  const crumbs = folder ? folder.split('/').map((_, k, a) => a.slice(0, k + 1).join('/')) : [];

  // ---------------------------------------------------------------- the folder tree
  const Tree = ({ parent, depth }: { parent: string; depth: number }) => (
    <>
      {kidsOf(parent).map((f) => (
        <span key={f} className="ma-folder" style={{ ['--d' as string]: depth }}>
          <button type="button" className={(folder === f ? 'on' : '') + (dropOn === f ? ' drop' : '')} onClick={() => setFolder(f)} onContextMenu={(e) => openMenu(e, folderMenu(f))} {...folderDrop(f)}>
            <FolderIcon size={15} open={folder === f || dropOn === f} />
            <span className="ma-fname">{leafOf(f)}</span> <b>{countIn(f)}</b>
          </button>
          {inTree(folder, f) && <Tree parent={f} depth={depth + 1} />}
        </span>
      ))}
    </>
  );

  const SECTIONS: { k: Section; label: string }[] = [
    { k: 'media', label: 'Media' },
    { k: 'tasks', label: 'Tasks' },
    { k: 'docs', label: 'Shared documents' },
    { k: 'shared', label: 'Shared with colleagues' },
  ];

  return (
    <div className="shell">
      <TopBar>
        <MainNav on="archive" />
      </TopBar>
      <div
        className={'ma' + (over ? ' dropping' : '') + (section !== 'media' ? ' no-side' : '') + (section === 'media' && open && uid ? ' with-detail' : '')}
        onDragOver={(e) => {
          if (section !== 'media' || !e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        {over && <div className="ma-drop">Drop pictures or sounds to add them{folder ? ` to ${leafOf(folder)}` : ''}</div>}
        <nav className="ma-sections" aria-label="Library">
          {SECTIONS.map((s) => (
            <button key={s.k} type="button" className={section === s.k ? 'on' : ''} aria-current={section === s.k ? 'page' : undefined} onClick={() => pick(s.k)}>
              {s.label}
            </button>
          ))}
          <Link to="/colleagues" className="ma-sections-link">
            Colleagues
          </Link>
        </nav>

        {section === 'media' && (
          <aside className="ma-side">
            <nav className="ma-nav ma-tree" aria-label="Folders">
              <span className="ma-h">Folders</span>
              <button type="button" className={(folder === '' ? 'on' : '') + (dropOn === '' ? ' drop' : '')} onClick={() => setFolder('')} onContextMenu={(e) => openMenu(e, emptyMenu)} {...folderDrop('')}>
                <UiIcon name="archive" size={16} />
                <span className="ma-fname">Resources library</span> <b>{all.length}</b>
              </button>
              <Tree parent="" depth={1} />
              <button type="button" className="ma-new" onClick={() => void newFolder()}>
                <UiIcon name="plus" size={14} /> New folder
              </button>
            </nav>
            {tags.length > 0 && (
              <div className="ma-tags">
                <span className="ma-h">Tags</span>
                <span className="ma-tag-list">
                  {tags.map(([t, n]) => (
                    <button key={t} type="button" className={'ap-chip' + (tag === t ? ' on' : '')} onClick={() => setTag(tag === t ? null : t)}>
                      {t} <span className="hint">{n}</span>
                    </button>
                  ))}
                </span>
              </div>
            )}
            <div className="ma-space small" title="The free plan has 1 GB for the whole app. Links to YouTube take no space.">
              <span className="ma-space-row">
                <b>{formatBytes(total)}</b>
                <span className="hint">of 1 GB</span>
              </span>
              <span className="ma-bar" aria-hidden="true">
                {KINDS.map((k) => {
                  const bytes = all.filter((i) => i.kind === k.k).reduce((s, i) => s + spaceOf(i), 0);
                  return <span key={k.k} className={'k-' + k.k} style={{ width: `${Math.max(bytes ? 0.8 : 0, (bytes / FREE) * 100)}%` }} />;
                })}
              </span>
            </div>
          </aside>
        )}

        {section === 'tasks' && uid && (
          <main className="ma-main">
            <div className="ma-head">
              <div className="ma-head-text">
                <h1 className="page-title">Tasks</h1>
                <span className="sub">Every task in all your classes. Open one, copy it into another lesson, or download it as a text file.</span>
              </div>
            </div>
            <ArchiveTasks uid={uid} />
          </main>
        )}
        {section === 'docs' && uid && (
          <main className="ma-main">
            <div className="ma-head">
              <div className="ma-head-text">
                <h1 className="page-title">Shared documents</h1>
                <span className="sub">The documents and slides your classes write together, and where each is used.</span>
              </div>
            </div>
            <ArchiveDocs uid={uid} />
          </main>
        )}
        {section === 'shared' && uid && (
          <main className="ma-main">
            <div className="ma-head">
              <div className="ma-head-text">
                <h1 className="page-title">Shared with colleagues</h1>
                <span className="sub">Lessons, tasks, documents and media colleagues share with you, as read-only copies, and what you share.</span>
              </div>
            </div>
            <ArchiveShared uid={uid} />
          </main>
        )}
        {section === 'colleagues' && <Navigate to="/colleagues" replace />}
        {section === 'media' && (
          <main className="ma-main">
            <div className="ma-head">
              <div className="ma-head-text">
                <nav className="ma-crumbs" aria-label="Where you are">
                  <button type="button" className={folder ? '' : 'here'} onClick={() => setFolder('')} {...folderDrop('')}>
                    Resources library
                  </button>
                  {crumbs.map((c) => (
                    <span key={c} className="ma-crumb">
                      <span className="ma-crumb-sep" aria-hidden="true">›</span>
                      <button type="button" className={c === folder ? 'here' : ''} onClick={() => setFolder(c)} onContextMenu={(e) => openMenu(e, folderMenu(c))} {...folderDrop(c)}>
                        {leafOf(c)}
                      </button>
                    </span>
                  ))}
                </nav>
                <h1 className="page-title">{folder ? leafOf(folder) : 'Resources library'}</h1>
              </div>
              <span className="ma-add">
                <button type="button" className="btn ma-new-folder" onClick={() => void newFolder()}>
                  <UiIcon name="folder" size={15} /> New folder
                </button>
                <button type="button" className="btn primary" onClick={() => setDialog({ tab: 'upload' })}>
                  + Add media
                </button>
              </span>
            </div>
            {(upBusy || busy) && <span className="hint">{upBusy || busy}</span>}
            <div className="ma-bar-row">
              <input className="ma-search" type="search" value={q} placeholder={folder ? `Search in ${leafOf(folder)}` : 'Search names, tags and scripts'} onChange={(e) => setQ(e.target.value)} />
              <span className="seg small-seg" role="radiogroup" aria-label="Kind">
                <button type="button" role="radio" aria-checked={!kind} className={!kind ? 'on' : ''} onClick={() => setKind(null)}>
                  All
                </button>
                {KINDS.map((k) => (
                  <button key={k.k} type="button" role="radio" aria-checked={kind === k.k} className={kind === k.k ? 'on' : ''} onClick={() => setKind(k.k)}>
                    {k.label}
                  </button>
                ))}
              </span>
              <select className="ma-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
                <option value="new">Newest first</option>
                <option value="name">By name</option>
                <option value="size">Largest first</option>
              </select>
              <span className="seg small-seg ma-views" role="radiogroup" aria-label="View">
                {VIEWS.map((v) => (
                  <button key={v.k} type="button" role="radio" aria-checked={view === v.k} className={view === v.k ? 'on' : ''} onClick={() => setView(v.k)} aria-label={v.label} data-tip={v.label}>
                    <ViewGlyph k={v.k} />
                  </button>
                ))}
              </span>
            </div>
            <div ref={filesRef} className={'ma-files' + (box ? ' boxing' : '')} onPointerDown={marquee} onContextMenu={(e) => !(e.target as HTMLElement).closest('[data-sel]') && openMenu(e, emptyMenu)}>
              {sel.size > 0 && (
                <div className="ma-selbar">
                  <b>{sel.size} chosen</b>
                  {selItems.length > 0 && (
                    <button type="button" className="btn small-btn" onClick={() => setMoving(selItems)}>
                      <UiIcon name="folder" size={14} /> Move to…
                    </button>
                  )}
                  <button type="button" className="btn small-btn" onClick={() => void download(selItems, selFolders)}>
                    <UiIcon name="import" size={14} /> Download
                  </button>
                  {selItems.length > 0 && (
                    <button type="button" className="btn small-btn" onClick={() => void removeI(selItems)}>
                      <UiIcon name="trash" size={14} /> Remove
                    </button>
                  )}
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn link small" onClick={() => setSel(new Set())}>
                    Clear
                  </button>
                </div>
              )}
              {items === null ? (
                <Loader label="Opening your resources library" />
              ) : shown.length === 0 && subFolders.length === 0 ? (
                <div className="ma-empty">
                  <UiIcon name="archive" size={28} />
                  <strong>{all.length ? (filtering ? 'Nothing matches' : 'This folder is empty') : 'Your resources library is empty'}</strong>
                  <span className="hint">{filtering ? 'Try another search, kind or tag.' : all.length ? 'Drop files here, or use Add media. Drag items onto a folder to move them.' : 'Pictures, recordings and videos you add to a task appear here, so you can use them again without uploading them twice.'}</span>
                </div>
              ) : view === 'list' ? (
                <div className="ma-list" role="table" aria-label="Media">
                  <span className="ma-lrow ma-lhead" role="row">
                    <span>Name</span>
                    <span>Kind</span>
                    <span>Size</span>
                    <span>Folder</span>
                    <span>Added</span>
                  </span>
                  {subFolders.map((f) => (
                    <button key={'f-' + f} type="button" data-sel={'f:' + f} className={'ma-lrow ma-lfolder' + (dropOn === f ? ' drop' : '') + (sel.has('f:' + f) ? ' chosen' : '')} onClick={clickFolder(f)} onDoubleClick={() => setFolder(f)} onContextMenu={(e) => (sel.has('f:' + f) || setSel(new Set(['f:' + f])), openMenu(e, folderMenu(f)))} {...folderDrop(f)}>
                      <span className="ma-lname">
                        <FolderIcon size={18} />
                        <b>{leafOf(f)}</b>
                      </span>
                      <span className="hint">Folder</span>
                      <span className="hint">{nItems(countIn(f))}</span>
                      <span />
                      <span />
                    </button>
                  ))}
                  {shown.map((i) => (
                    <button key={i.id} type="button" data-sel={i.id} draggable onDragStart={dragItem(i)} className={'ma-lrow' + (openId === i.id ? ' on' : '') + (sel.has(i.id) ? ' chosen' : '')} onClick={clickItem(i)} onContextMenu={(e) => (sel.has(i.id) || setSel(new Set([i.id])), openMenu(e, itemMenu(i)))}>
                      <span className="ma-lname">
                        {i.kind === 'image' && (i.thumb || i.link) ? <img className="ma-lthumb" src={i.thumb || i.link} alt="" /> : <FileIcon kind={i.kind} size={18} label={false} />}
                        <b>{i.name}</b>
                        {sharedIds.has(i.id) && <SharedMark />}
                        {i.tags.slice(0, 2).map((t) => (
                          <span key={t} className="ma-ltag">
                            {t}
                          </span>
                        ))}
                      </span>
                      <span className="hint">
                        {kindName(i.kind)}
                        {i.duration ? ' · ' + fmtTime(i.duration) : ''}
                      </span>
                      <span className="hint">{i.link ? 'Link' : formatBytes(spaceOf(i))}</span>
                      <span className="hint">{i.folder ? leafOf(i.folder) : '·'}</span>
                      <span className="hint">{dayOf(i.createdAt)}</span>
                    </button>
                  ))}
                </div>
              ) : view === 'time' ? (
                <div className="ma-time">
                  {months(shown).map(([m, list]) => (
                    <section key={m} className="ma-tm">
                      <span className="ma-tm-h">
                        <i aria-hidden="true" />
                        <b>{m}</b>
                        <span className="hint">{nItems(list.length)}</span>
                      </span>
                      <div className="ma-tm-strip">
                        {list.map((i) => (
                          <span key={i.id} className="ma-tm-it">
                            <span className="ma-tm-day">{dayOf(i.createdAt)}</span>
                            <Card item={i} on={openId === i.id} chosen={sel.has(i.id)} shared={sharedIds.has(i.id)} onClick={clickItem(i)} onDragStart={dragItem(i)} onMenu={(e) => (sel.has(i.id) || setSel(new Set([i.id])), openMenu(e, itemMenu(i)))} />
                          </span>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="ma-grid">
                  {subFolders.map((f) => (
                    <button key={'f-' + f} type="button" data-sel={'f:' + f} className={'ma-card ma-fcard' + (dropOn === f ? ' drop' : '') + (sel.has('f:' + f) ? ' chosen' : '')} onClick={clickFolder(f)} onDoubleClick={() => setFolder(f)} onContextMenu={(e) => (sel.has('f:' + f) || setSel(new Set(['f:' + f])), openMenu(e, folderMenu(f)))} {...folderDrop(f)}>
                      <span className="ma-thumb ma-fthumb">
                        <FolderIcon size={40} open={dropOn === f} />
                      </span>
                      <span className="ma-name">{leafOf(f)}</span>
                      <span className="ma-meta">{nItems(countIn(f))}</span>
                    </button>
                  ))}
                  {shown.map((i) => (
                    <Card key={i.id} item={i} on={openId === i.id} chosen={sel.has(i.id)} shared={sharedIds.has(i.id)} onClick={clickItem(i)} onDragStart={dragItem(i)} onMenu={(e) => (sel.has(i.id) || setSel(new Set([i.id])), openMenu(e, itemMenu(i)))} />
                  ))}
                </div>
              )}
              {box && <span className="ma-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} aria-hidden="true" />}
            </div>
          </main>
        )}

        {section === 'media' && open && uid && <Detail key={open.id} uid={uid} item={open} folders={allFolders} shared={sharedIds.has(open.id)} onClose={() => setOpenId(null)} />}
        {dialog && space && <MediaDialog classId={space} tab={dialog.tab} file={dialog.file} folder={folder} noArchive onPictures={(f) => void addPictures(f)} onClose={() => setDialog(null)} onPick={() => setDialog(null)} />}
        {moving && <MoveDialog folders={allFolders} count={moving.length} from={moving.length === 1 ? moving[0].folder : null} onClose={() => setMoving(null)} onMove={(to) => (void moveTo(moving, to), setMoving(null))} />}
      </div>
    </div>
  );
}

function SharedMark() {
  return (
    <span className="ma-shared" data-tip="Shared with colleagues" aria-label="Shared">
      <UiIcon name="groups" size={11} />
    </span>
  );
}

function MoveDialog({ folders, count, from, onClose, onMove }: { folders: string[]; count: number; from: string | null; onClose: () => void; onMove: (to: string) => void }) {
  const [to, setTo] = useState(from ?? '');
  return (
    <div className="scrim ask-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog ask ma-move" role="dialog" aria-label="Move">
        <h2 className="ask-head">{count === 1 ? 'Move to a folder' : `Move ${count} items to a folder`}</h2>
        <div className="ma-move-list" role="radiogroup">
          {['', ...folders].map((f) => (
            <button key={f || 'root'} type="button" role="radio" aria-checked={to === f} className={to === f ? 'on' : ''} style={{ ['--d' as string]: f ? f.split('/').length : 0 }} onClick={() => setTo(f)} onDoubleClick={() => onMove(f)}>
              {f ? <FolderIcon size={15} open={to === f} /> : <UiIcon name="archive" size={15} />}
              {f ? leafOf(f) : 'Resources library'}
            </button>
          ))}
        </div>
        <span className="ask-acts">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={from !== null && to === from} onClick={() => onMove(to)}>
            Move here
          </button>
        </span>
      </div>
    </div>
  );
}

function Card({ item, on, chosen, shared, onClick, onDragStart, onMenu }: { item: ArchiveItem; on: boolean; chosen: boolean; shared: boolean; onClick: (e: React.MouseEvent) => void; onDragStart: (e: React.DragEvent) => void; onMenu: (e: React.MouseEvent) => void }) {
  const places = new Set([item.home?.classId, ...Object.keys(item.copies ?? {})].filter((c) => c && !c.startsWith('user:'))).size;
  return (
    <button type="button" data-sel={item.id} className={'ma-card' + (on ? ' on' : '') + (chosen ? ' chosen' : '')} onClick={onClick} onContextMenu={onMenu} draggable onDragStart={onDragStart}>
      <span className={'ma-thumb k-' + item.kind}>
        {item.kind === 'image' && (item.thumb || item.link) ? (
          <img src={item.thumb || item.link} alt="" draggable={false} />
        ) : item.link && item.kind === 'video' && /youtu/.test(item.link) ? (
          <img src={`https://img.youtube.com/vi/${/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/.exec(item.link)?.[1] ?? ''}/mqdefault.jpg`} alt="" draggable={false} />
        ) : (
          <FileIcon kind={item.kind} size={30} />
        )}
        {item.duration ? <span className="ma-dur">{fmtTime(item.duration)}</span> : null}
        <span className="ma-badges">
          {shared && <SharedMark />}
          {(item.script?.length ?? 0) > 0 && (
            <span className="ma-badge" data-tip="Has a transcript">
              <UiIcon name="script" size={11} />
            </span>
          )}
        </span>
      </span>
      <span className="ma-name">{item.name}</span>
      <span className="ma-meta">
        {item.link ? 'Link' : formatBytes(spaceOf(item))}
        {places > 1 ? ` · ${places} classes` : ''}
      </span>
      {item.tags.length > 0 && (
        <span className="ma-card-tags">
          {item.tags.slice(0, 3).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </span>
      )}
    </button>
  );
}

function months(list: ArchiveItem[]): [string, ArchiveItem[]][] {
  const m = new Map<string, ArchiveItem[]>();
  [...list].sort((a, b) => b.createdAt - a.createdAt).forEach((i) => {
    const k = monthOf(i.createdAt);
    m.set(k, [...(m.get(k) ?? []), i]);
  });
  return [...m];
}

function ViewGlyph({ k }: { k: View }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      {k === 'icons' ? (
        <>
          <rect x="2" y="2" width="5" height="5" rx="1.2" />
          <rect x="9" y="2" width="5" height="5" rx="1.2" />
          <rect x="2" y="9" width="5" height="5" rx="1.2" />
          <rect x="9" y="9" width="5" height="5" rx="1.2" />
        </>
      ) : k === 'list' ? (
        <path d="M2.5 4h1M6 4h7.5M2.5 8h1M6 8h7.5M2.5 12h1M6 12h7.5" />
      ) : (
        <>
          <path d="M3.5 2v12" />
          <circle cx="3.5" cy="4.5" r="1.4" fill="currentColor" />
          <circle cx="3.5" cy="10.5" r="1.4" fill="currentColor" />
          <path d="M7 4.5h6.5M7 10.5h4.5" />
        </>
      )}
    </svg>
  );
}

function BigPicture({ item }: { item: ArchiveItem }) {
  const url = useImageSrc(item.home?.classId ?? '', item.home ? 'media:' + item.home.mediaId : item.link ?? '');
  return url ? <img className="ma-big" src={url} alt="" /> : <span className="pic-wait" />;
}

function Detail({ uid, item, folders, shared, onClose }: { uid: string; item: ArchiveItem; folders: string[]; shared: boolean; onClose: () => void }) {
  const [uses, setUses] = useState<Awaited<ReturnType<typeof findUses>> | 'loading' | null>(null);
  const [name, setName] = useState(item.name);
  const [tagText, setTagText] = useState('');
  const [script, setScript] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState<SoundSource | 'loading' | null>(null);
  const [dl, setDl] = useState('');
  const [sharing, setSharing] = useState(false);
  const phone = usePhone();
  const openEditor = async () => {
    if (!item.home) return;
    setEditing('loading');
    try {
      const m = await loadManifest(item.home.classId, item.home.mediaId);
      if (!m) throw new Error('missing');
      const url = await soundUrl(item.home.classId, item.home.mediaId, m);
      const buffer = await decodeSound(await (await fetch(url)).blob());
      const lines = item.script ?? m.script ?? [];
      setEditing({ buffer, name: item.name, script: lines.map((l) => l.text), marks: lines.map((l) => (l.t === null ? NaN : l.t)) });
    } catch {
      setEditing(null);
      setDl('The sound could not be opened.');
    }
  };
  const save = (patch: Parameters<typeof archiveUpdate>[2]) => archiveUpdate(uid, item, patch).catch(() => {});
  const addTag = () => {
    const t = tagText.trim().replace(/^#/, '');
    if (t && !item.tags.includes(t)) save({ tags: [...item.tags, t] });
    setTagText('');
  };
  const classes = new Set([item.home?.classId, ...Object.keys(item.copies ?? {})].filter((c) => c && !c.startsWith('user:'))).size;
  return (
    <aside className="ma-detail" aria-label={item.name}>
      <div className="ma-detail-head">
        <span className="pop-type">{item.kind === 'image' ? 'Picture' : item.kind === 'video' ? 'Video' : 'Sound'}</span>
        <button type="button" className="ma-x big" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="ma-preview">{item.kind === 'image' ? <BigPicture item={item} /> : item.home ? <MediaPlayer classId={item.home.classId} mediaId={item.home.mediaId} title={item.name} teacher /> : null}</div>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== item.name && save({ name: name.trim() })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </label>
      <label className="field">
        <span>Folder</span>
        <select value={item.folder} onChange={(e) => save({ folder: e.target.value })}>
          <option value="">Resources library</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {'\u00a0\u00a0'.repeat(f.split('/').length - 1)}
              {leafOf(f)}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Tags</span>
        <span className="ma-tag-edit">
          {item.tags.map((t) => (
            <span key={t} className="sed-chip">
              {t}
              <button type="button" aria-label={`Remove the tag ${t}`} onClick={() => save({ tags: item.tags.filter((x) => x !== t) })}>
                ×
              </button>
            </span>
          ))}
          <input
            value={tagText}
            placeholder={item.tags.length ? 'Add a tag' : 'Add tags: unit 4, food, B1…'}
            onChange={(e) => setTagText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag();
              } else if (e.key === 'Backspace' && !tagText && item.tags.length) save({ tags: item.tags.slice(0, -1) });
            }}
            onBlur={addTag}
          />
        </span>
      </div>
      <span className="ma-detail-acts">
        <button
          type="button"
          className="btn small-btn"
          onClick={async () => {
            setDl('Getting the file…');
            await downloadItem(item).catch(() => setDl('It could not be downloaded.'));
            setDl('');
          }}
        >
          <UiIcon name={item.link ? 'link' : 'import'} size={14} /> {item.link ? 'Open the link' : 'Download'}
        </button>
        {item.kind === 'audio' && !item.link && item.home && !phone && (
          <button type="button" className="btn small-btn" onClick={openEditor} disabled={editing === 'loading'}>
            <UiIcon name="edit" size={14} /> {editing === 'loading' ? 'Opening…' : 'Edit the sound'}
          </button>
        )}
        <button type="button" className="btn small-btn" onClick={() => setSharing(true)}>
          <UiIcon name="link" size={14} /> Share…
        </button>
      </span>
      {sharing && (
        <ShareDialog
          what={{ kind: 'media', title: item.name, src: { archiveId: item.id }, archive: Object.fromEntries(Object.entries({ kind: item.kind, name: item.name, tags: item.tags, size: item.size, link: item.link, home: item.home, thumb: item.thumb, script: item.script, duration: item.duration }).filter(([, v]) => v !== undefined)) }}
          onClose={() => setSharing(false)}
        />
      )}
      {dl && <span className="hint">{dl}</span>}
      {item.kind !== 'image' && item.home && (
        <div className="field">
          <span>Karaoke script</span>
          <span className="hint">{item.script?.length ? `${item.script.length} lines${item.script.some((l) => l.t !== null) ? ', timed' : ', not timed yet'}. Changes reach every lesson that uses it.` : 'No script yet.'}</span>
          <button type="button" className="btn small-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setScript(true)}>
            <UiIcon name="script" size={14} /> {item.script?.length ? 'Edit the script and timing' : 'Add a script'}
          </button>
        </div>
      )}
      <dl className="ma-facts">
        <dt>Space</dt>
        <dd>{item.link ? 'None (a link)' : formatBytes(spaceOf(item))}</dd>
        {item.duration ? (
          <>
            <dt>Length</dt>
            <dd>{fmtTime(item.duration)}</dd>
          </>
        ) : null}
        <dt>Used in</dt>
        <dd>
          {classes ? (
            <button type="button" className="btn link small ma-uses-btn" onClick={() => (uses && uses !== 'loading' ? setUses(null) : (setUses('loading'), void findUses(item).then(setUses, () => setUses([]))))}>
              {classes} {classes === 1 ? 'class' : 'classes'} · {uses && uses !== 'loading' ? 'hide the lessons' : 'show the lessons'}
            </button>
          ) : (
            'No class yet'
          )}
        </dd>
        {shared && (
          <>
            <dt>Shared</dt>
            <dd>With colleagues</dd>
          </>
        )}
        <dt>Added</dt>
        <dd>{new Date(item.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
        {item.link && (
          <>
            <dt>Address</dt>
            <dd className="ma-link">
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                {item.link.replace(/^https?:\/\//, '')}
              </a>
            </dd>
          </>
        )}
      </dl>
      {uses && (
        <div className="ma-uses">
          {uses === 'loading' ? (
            <span className="hint">Looking through your lessons…</span>
          ) : uses.length === 0 ? (
            <span className="hint">No lesson uses it right now.</span>
          ) : (
            [...new Map(uses.map((u) => [u.classId + u.itemId, u])).values()].map((u) => (
              <Link key={u.classId + u.itemId} to={`/class/${u.classId}/lesson/${u.itemId}`} className="ma-use">
                <FileIcon kind="lesson" size={22} label={false} />
                <span>
                  <b>{u.lesson}</b>
                  <span className="hint">
                    {u.cls} · {uses.filter((x) => x.classId === u.classId && x.itemId === u.itemId).map((x) => x.task).join(', ')}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>
      )}
      {confirm ? (
        <span className="ma-confirm">
          <span className="hint">Remove it from the library? Lessons that use it keep it.</span>
          <button type="button" className="btn small-btn" onClick={() => setConfirm(false)}>
            Keep
          </button>
          <button type="button" className="btn small-btn danger" onClick={() => (archiveRemove(uid, item.id).catch(() => {}), onClose())}>
            Remove
          </button>
        </span>
      ) : (
        <button type="button" className="btn link ma-remove" onClick={() => setConfirm(true)}>
          <UiIcon name="trash" size={14} /> Remove from the library
        </button>
      )}
      {editing && editing !== 'loading' &&
        createPortal(
          <div className="scrim">
            <div className="dialog md-dialog" role="dialog" aria-label="Edit the sound" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <div className="pic-dialog-head">
                <h2 style={{ margin: 0 }}>Edit “{item.name}”</h2>
                <button type="button" className="btn link" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
              <SoundEditor
                source={editing}
                classId={'user:' + uid}
                folder={item.folder}
                backLabel="Close"
                onBack={() => setEditing(null)}
                onSaved={() => setEditing(null)}
                replace={{ name: item.name, uses: () => findUses(item), run: (blob, meta, p) => replaceSound(uid, item, blob, meta, p) }}
              />
            </div>
          </div>,
          document.body,
        )}
      {script && item.home && <ScriptEditor classId={item.home.classId} mediaId={item.home.mediaId} title={item.name} onClose={() => setScript(false)} onSave={(lines) => archiveUpdate(uid, item, { script: lines })} />}
    </aside>
  );
}

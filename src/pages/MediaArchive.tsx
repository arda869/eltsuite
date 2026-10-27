import { createPortal } from 'react-dom';
import { useAccount, useSpaceLimit, noteSpace, useMyOrg, useDrive, type DriveFolder } from '../lib/admin';
import { copyFile } from '../lib/copyFile';
import { Select } from '../components/Select';
import { newSharedDoc, removeSharedDoc, renameDoc, setDocPath, useMyDocs, type DocKind, type SharedDoc } from '../lib/sharedDocs';
import { ShareDialog as DocShareDialog, SharePeople as DocSharePeople } from './DocPage';
import { shareLesson, unshareLesson, useClassLessons, useHandIns, type ClassLesson, type HandIn } from '../lib/classFiles';
import { useDirectory } from '../lib/directory';
import { usePhone } from '../lib/useMedia';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FileDocs, ArchiveDocs, ArchiveShared, downloadTask, taskMd } from './ArchiveLibrary';
import { moveLibTasks, removeLibTask, renameLibTask, useLibTasks, type LibTask } from '../lib/libtasks';
import { ChainIcon, FolderDetail, TaskDetail, TaskWindow } from './LibraryParts';
import { useDismiss } from '../lib/useDismiss';
import { RecordTogether } from './StudioSession';
import { ShareDialog } from '../components/ShareDialog';
import { Link, Navigate } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { MainNav } from './ColleaguesPage';
import { UiIcon } from '../components/UiIcon';
import { Loader } from '../components/Loader';
import { useAuth } from '../lib/auth';
import { addFolder, archiveRemove, archiveUpdate, downloadItem, downloadZip, findUses, formatBytes, inTree, leafOf, moveItems, parentOf, removeFolder, renameFolder, useArchive, useFolders, type ArchiveItem } from '../lib/archive';
import { useMyShares } from '../lib/sharing';
import { openMenu, type MenuItem } from '../components/ContextMenu';
import { useImageSrc } from '../editor/PackNode';
import { MediaPlayer } from '../media/Player';
import { ScriptEditor } from '../media/ScriptEditor';
import { fmtTime } from '../lib/sound';
import { MediaDialog, type MediaTab } from '../media/MediaDialog';
import { WorksheetDialog } from '../components/WorksheetDialog';
import { MAX_PDF, openPdf, pageSizes, saveFilePdf } from '../pdf/pdfData';
import { FileIcon, FolderIcon } from '../components/FileIcon';
import { ask, tell } from '../lib/ask';
import { uploadPicture, type PicQuality } from '../editor/PackNode';

// The resources library: pictures, sounds, videos and tasks the teacher keeps, in folders, to use
// in any lesson. Works like a folder on a computer: icons, a list or a timeline; click to select,
// double-click to open, drag a box to select several, drag onto a folder to move, right-click for
// more, type over a name to rename it. The pane on the right shows whatever is selected.

const KINDS = [
  { k: 'image', label: 'Pictures', icon: 'picture' },
  { k: 'audio', label: 'Recordings', icon: 'music' },
  { k: 'video', label: 'Videos', icon: 'video' },
] as const;
type Kind = 'image' | 'audio' | 'video' | 'task' | 'lesson' | 'doc' | 'slides' | 'flash' | 'pd' | 'pdf';
const ALL_KINDS: { k: Kind; label: string }[] = [{ k: 'lesson', label: 'Lessons' }, { k: 'doc', label: 'Collab documents' }, { k: 'flash', label: 'Flashcards' }, { k: 'pd', label: 'PD reading' }, { k: 'pdf', label: 'PDFs' }, ...KINDS.map((k) => ({ k: k.k as Kind, label: k.label }))];
const COLLAB_KINDS: Kind[] = ['doc', 'slides'];
type Sort = 'new' | 'name' | 'size' | 'type';
type Group = 'none' | 'type';
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
const kindName = (k: string) => ({ image: 'Picture', video: 'Video', task: 'Task', audio: 'Recording', lesson: 'Lesson', doc: 'Collab document', pdf: 'PDF', slides: 'Slides', flash: 'Flashcards', pd: 'PD reading' })[k] ?? 'File';
const ORDER: Record<Kind, number> = { lesson: 0, task: 1, doc: 2, slides: 3, flash: 4, pd: 5, pdf: 6, image: 7, audio: 8, video: 9 };

// The space an item takes: its size in each class that has a copy.
const spaceOf = (i: ArchiveItem) => (i.size || 0) * (1 + Object.keys(i.copies ?? {}).filter((c) => c !== i.home?.classId).length) + (i.thumb?.length ?? 0);

// One thing in the library, whatever it is.
type Entry = { key: string; kind: Kind; name: string; folder: string; at: number; size: number; item?: ArchiveItem; task?: LibTask; doc?: SharedDoc; cls?: ClassLesson; hand?: HandIn };
const CLASSES = 'Classes';
const entryOfLesson = (l: ClassLesson): Entry => ({ key: `l:${l.classId}/${l.itemId}`, kind: 'lesson', name: l.title, folder: `${CLASSES}/${l.className.replace(/\//g, '-')}${l.topic ? '/' + l.topic.replace(/\//g, '-') : ''}`, at: l.at, size: 0, cls: l });
// A learner's hand-in: in the class's folder, under Handed in and the learner's name.
const entryOfHandIn = (h: HandIn): Entry => ({ key: `h:${h.classId}/${h.id}`, kind: h.type.startsWith('image/') ? 'image' : h.type.startsWith('audio/') ? 'audio' : h.type.startsWith('video/') ? 'video' : 'pdf', name: h.name, folder: `${CLASSES}/${h.className.replace(/\//g, '-')}/Handed in/${h.learner.replace(/\//g, '-')}`, at: h.at, size: 0, hand: h });
const inClasses = (f: string) => f === CLASSES || f.startsWith(CLASSES + '/');
const entryOfDoc = (d: SharedDoc): Entry => ({ key: 'd:' + d.id, kind: d.kind as Kind, name: d.title, folder: d.path ?? '', at: d.updatedAt?.toMillis?.() ?? d.createdAt?.toMillis?.() ?? 0, size: d.size ?? 0, doc: d });
const entryOfItem = (i: ArchiveItem): Entry => ({ key: i.id, kind: i.kind, name: i.name, folder: i.folder, at: i.createdAt, size: spaceOf(i), item: i });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const entryOfTask = (t: LibTask): Entry => ({ key: 't:' + t.id, kind: 'task', name: t.title, folder: t.folder, at: t.createdAt || t.updatedAt, size: 0, task: t });

type Section = 'media' | 'folders' | 'docs' | 'shared' | 'colleagues';

const openStudio = (kind: 'task' | 'sound', id: string) => window.open(`/studio/${kind}/${id}`, '_blank');
const stored = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
};
const store = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* fine */
  }
};

export function MediaArchive() {
  const { user } = useAuth();
  const uid = user?.uid;
  const quota = useSpaceLimit();
  const acct = useAccount(uid);
  const dir = useDirectory();
  const phone = usePhone();
  const touch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
  const [section, setSection] = useState<Section>(() => {
    const v = new URLSearchParams(window.location.search).get('show');
    return v === 'docs' || v === 'shared' || v === 'folders' ? v : new URLSearchParams(window.location.search).get('folder') ? 'folders' : 'media';
  });
  const pick = (k: Section) => {
    setSection(k);
    window.history.replaceState(null, '', k === 'media' ? '/archive' : `/archive?show=${k}`);
  };
  const items = useArchive(uid);
  const libTasks = useLibTasks(uid);
  const markers = useFolders(uid);
  const shares = useMyShares(uid);
  const sharedIds = useMemo(() => new Set((shares ?? []).map((s) => s.src?.archiveId).filter(Boolean) as string[]), [shares]);
  const [folder, setFolderRaw] = useState(''); // '' is the library itself
  // Recent: everything used last, wherever it is.
  const [recent, setRecent] = useState(false);
  const setFolder = (f: string) => (setRecent(false), setFolderRaw(f));
  const [kinds, setKindsS] = useState<Kind[]>(() => stored('ll.maKinds', [] as Kind[])); // none chosen: everything
  const setKinds = (k: Kind[]) => (setKindsS(k), store('ll.maKinds', k));
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [sort, setSortS] = useState<Sort>(() => stored('ll.maSort', 'new' as Sort));
  const setSort = (v: Sort) => (setSortS(v), store('ll.maSort', v));
  const [group, setGroupS] = useState<Group>(() => stored('ll.maGroup', 'none' as Group));
  const setGroup = (v: Group) => (setGroupS(v), store('ll.maGroup', v));
  const [view, setViewS] = useState<View>(() => stored('ll.maView2', 'icons' as View));
  const setView = (v: View) => (setViewS(v), store('ll.maView2', v));
  const [dialog, setDialog] = useState<{ tab: MediaTab; file?: File } | null>(null);
  const [upBusy, setUpBusy] = useState('');
  const [over, setOver] = useState(false);
  const [moving, setMoving] = useState<Entry[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // a library task open in its window
  const [renaming, setRenaming] = useState<string | null>(null); // an entry key or 'f:' + path
  const [filterOpen, setFilterOpen] = useState(false);
  const [together, setTogether] = useState(false);
  const filterRef = useDismiss<HTMLSpanElement>(filterOpen, () => setFilterOpen(false));
  const space = uid ? 'user:' + uid : '';
  const quality = (): PicQuality => {
    const v = stored<string>('ll.picQuality', 'standard');
    return v === 'high' || v === 'small' ? v : 'standard';
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

  const { mine: myDocsTop } = useMyDocs(uid || undefined);
  const all = items ?? [];
  const tasks = libTasks ?? [];
  const ownDocs = useMemo(() => (myDocsTop ?? []).filter((d) => !d.folder), [myDocsTop]);
  // Folders of the organisation library this teacher may add to.
  const myOrg = useMyOrg();
  const drive = useDrive(myOrg);
  const orgFolders = useMemo(() => (drive ?? []).filter((f) => f.owner === uid || (f as { members?: Record<string, { role: string }> }).members?.[uid ?? '']?.role === 'edit'), [drive, uid]);
  const [toOrg, setToOrg] = useState<SharedDoc | null>(null);
  const classLessons = useClassLessons(uid);
  const handIns = useHandIns(uid);
  const entries = useMemo(() => [...all.map(entryOfItem), ...ownDocs.filter((d) => d.kind !== 'lesson').map(entryOfDoc), ...(classLessons.list ?? []).map(entryOfLesson), ...(handIns ?? []).map(entryOfHandIn)], [all, ownDocs, classLessons.list, handIns]);
  const [sharingLesson, setSharingLesson] = useState<ClassLesson | null>(null);
  const [exporting, setExporting] = useState<ClassLesson | null>(null);
  const [lessonWarned, setLessonWarned] = useState(false);
  const [sharing, setSharing] = useState<SharedDoc | null>(null);
  // Every folder, with the folders above it.
  const allFolders = useMemo(() => {
    const set = new Set<string>();
    [...markers, ...entries.map((e) => e.folder)].filter(Boolean).forEach((f) => {
      const parts = f.split('/');
      parts.forEach((_, k) => set.add(parts.slice(0, k + 1).join('/')));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [markers, entries]);
  const kidsOf = (f: string) => allFolders.filter((x) => parentOf(x) === f);
  const countIn = (f: string) => entries.filter((e) => inTree(e.folder, f)).length;
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    all.forEach((i) => i.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);
  const filtering = !!q.trim() || kinds.length > 0 || !!tag;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    // Searching and filtering look through this folder and every folder in it; the timeline too.
    const list = entries
      .filter((e) => recent || (filtering || view === 'time' ? inTree(e.folder, folder) : e.folder === folder))
      .filter((e) => !kinds.length || kinds.includes(e.kind))
      .filter((e) => !tag || (e.item?.tags ?? []).includes(tag))
      .filter((e) => !s || `${e.name} ${(e.item?.tags ?? []).join(' ')} ${(e.item?.script ?? []).map((l) => l.text).join(' ')} ${e.task?.instructions ?? ''}`.toLowerCase().includes(s));
    const by = sort === 'name' ? (a: Entry, b: Entry) => a.name.localeCompare(b.name) : sort === 'size' ? (a: Entry, b: Entry) => b.size - a.size : sort === 'type' ? (a: Entry, b: Entry) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name) : (a: Entry, b: Entry) => b.at - a.at;
    if (recent) return [...list].sort((a, b) => b.at - a.at).slice(0, 40);
    return [...list].sort(by);
  }, [entries, folder, kinds, tag, q, sort, filtering, view, recent]);
  const subFolders = filtering || view === 'time' || recent ? [] : kidsOf(folder);
  const groups: [string, Entry[]][] = group === 'type' ? ALL_KINDS.map((k) => [k.label, shown.filter((e) => e.kind === k.k)] as [string, Entry[]]).filter(([, l]) => l.length) : [['', shown]];
  const myDocs = myDocsTop;
  const docBytes = (myDocs ?? []).reduce((s, d) => s + (d.size ?? 0), 0);
  // Lessons are measured a few times an hour (scripts/space.mjs) and count too.
  const lessonBytes = acct?.lessonBytes ?? 0;
  const total = all.reduce((s, i) => s + spaceOf(i), 0) + docBytes + lessonBytes;
  useEffect(() => void (uid && items !== null && myDocs !== null && noteSpace(uid, total - lessonBytes)), [uid, items, myDocs, total, lessonBytes]);

  // ---------------------------------------------------------------- selecting
  // Click selects one, Ctrl/Cmd or Shift click adds, and dragging on the empty space draws a box
  // that selects what it touches. Folders are 'f:' + path.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const cursor = useRef<string | null>(null);
  const order = [...subFolders.map((f) => 'f:' + f), ...groups.flatMap(([, l]) => l.map((e) => e.key))];
  useEffect(() => setSel(new Set()), [folder, kinds.join(), tag, q, section]);
  const select = (id: string, e: React.MouseEvent | { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (e.shiftKey && anchor.current) {
      const a = order.indexOf(anchor.current);
      const b = order.indexOf(id);
      if (a >= 0 && b >= 0) return setSel(new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1)));
    }
    anchor.current = id;
    cursor.current = id;
    if (e.metaKey || e.ctrlKey) return setSel((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
    setSel(new Set([id]));
  };
  const selEntries = shown.filter((e) => sel.has(e.key));
  const selFolders = subFolders.filter((f) => sel.has('f:' + f));
  const one = sel.size === 1 ? [...sel][0] : null;
  // Lessons and hand-ins follow their classes: they are not moved, renamed or removed here.
  const movable = selEntries.filter((e) => !e.cls && !e.hand);
  const fixedOne = !!one && selEntries.some((e) => e.key === one && (e.cls || e.hand));
  const filesRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marquee = (e: React.PointerEvent) => {
    if (e.button !== 0 || touch) return;
    if ((e.target as HTMLElement).closest('[data-sel], button, a, input, select')) return;
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

  // ---------------------------------------------------------------- actions
  const [busy, setBusy] = useState('');
  const newFolder = async (inside = folder) => {
    if (!uid) return;
    let n = 'New folder';
    for (let k = 2; allFolders.includes(inside ? `${inside}/${n}` : n); k++) n = `New folder ${k}`;
    const path = inside ? `${inside}/${n}` : n;
    await addFolder(uid, path).catch(() => {});
    if (inside !== folder) setFolder(inside);
    setSel(new Set(['f:' + path]));
    setRenaming('f:' + path); // straight into typing its name, like on a computer
  };
  const doRename = async (key: string, name: string) => {
    setRenaming(null);
    const n = name.trim();
    if (!n || !uid) return;
    if (key.startsWith('f:')) {
      const f = key.slice(2);
      const leaf = n.replace(/\//g, '-');
      if (leaf === leafOf(f)) return;
      const to = parentOf(f) ? `${parentOf(f)}/${leaf}` : leaf;
      await renameFolder(uid, f, to, all, allFolders).catch(() => {});
      await Promise.all(tasks.filter((t) => inTree(t.folder, f)).map((t) => moveLibTasks(uid, [t.id], to + t.folder.slice(f.length)))).catch(() => {});
      if (inTree(folder, f)) setFolder(to + folder.slice(f.length));
      setSel(new Set(['f:' + to]));
      return;
    }
    const e = entries.find((x) => x.key === key);
    if (!e || n === e.name || e.cls) return;
    if (e.item) await archiveUpdate(uid, e.item, { name: n }).catch(() => {});
    else if (e.task) await renameLibTask(uid, e.task.id, n).catch(() => {});
    else if (e.doc) await renameDoc(e.doc.id, n).catch(() => {});
  };
  const deleteF = async (f: string) => {
    const n = countIn(f);
    if (!(await ask(`Delete the folder “${leafOf(f)}”? ${n ? `The ${n === 1 ? 'item' : `${n} items`} in it move up to ${parentOf(f) ? `“${leafOf(parentOf(f))}”` : 'the library'}.` : 'It is empty.'}`, { ok: 'Delete the folder' }))) return;
    if (!uid) return;
    await removeFolder(uid, f, all, allFolders).catch(() => {});
    await moveLibTasks(uid, tasks.filter((t) => inTree(t.folder, f)).map((t) => t.id), parentOf(f)).catch(() => {});
    if (inTree(folder, f)) setFolder(parentOf(f));
    setSel(new Set());
  };
  const removeE = async (list: Entry[]) => {
    if (!list.length || !uid) return;
    const lessons = list.reduce((s, e) => s + (e.task?.uses.length ?? 0), 0);
    const media = list.some((e) => e.item);
    if (!(await ask(`${list.length === 1 ? `Remove “${list[0].name}”?` : `Remove ${list.length} items?`} ${media ? 'Pictures, recordings and videos are removed from the lessons that use them too, so they take no more space.' : ''}${lessons ? ' Tasks already in lessons stay there, no longer linked.' : ''}`.trim(), { ok: 'Remove' }))) return;
    list = list.filter((e) => !e.cls && !e.hand);
    if (!list.length) return;
    for (const e of list) {
      if (e.item) await archiveRemove(uid, e.item.id, e.item).catch(() => {});
      else if (e.task) await removeLibTask(uid, e.task).catch(() => {});
      else if (e.doc) await removeSharedDoc(e.doc.id).catch(() => {});
    }
    setSel(new Set());
  };
  const download = async (list: Entry[], folders: string[] = []) => {
    const every = [...new Map([...list, ...entries.filter((e) => folders.some((f) => inTree(e.folder, f)))].map((e) => [e.key, e])).values()];
    if (!every.length) return;
    if (every.length === 1 && !folders.length && (every[0].item || every[0].task)) return every[0].item ? void downloadItem(every[0].item).catch(() => {}) : every[0].task && downloadTask(every[0].task);
    setBusy('Putting the files together…');
    const base = folders.length === 1 && !list.length ? folders[0] : folder;
    try {
      // Documents, slides, flashcards, reading, PDFs and lessons, each in the form used outside the app.
      const { sharedDocFiles, classLessonFiles } = await import('../lib/folderExport');
      const others = every.filter((e) => e.doc || e.cls);
      const made: { folder: string; name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < others.length; i++) {
        const e = others[i];
        setBusy(`Making the files… ${i + 1} of ${others.length}`);
        const out = await (e.doc ? sharedDocFiles(e.doc) : classLessonFiles(e.cls!)).catch((err) => (console.error(err), []));
        made.push(...out.map((f) => ({ folder: e.folder, name: f.name, data: f.data })));
      }
      await downloadZip(
        every.filter((e) => e.item).map((e) => e.item!),
        folders.length === 1 && !list.length ? leafOf(folders[0]) : folder ? leafOf(folder) : 'Resources',
        base,
        (d, t) => setBusy(`Putting the files together… ${d} of ${t}`),
        every.filter((e) => e.task).map((e) => ({ folder: e.folder, name: e.name, text: taskMd(e.task!) })),
        made,
      );
      setBusy('');
    } catch {
      setBusy('The download could not be made. Try fewer items.');
    }
  };
  const moveTo = async (list: Entry[], to: string) => {
    if (!uid) return;
    if (inClasses(to)) return;
    list = list.filter((e) => !e.cls);
    const its = list.filter((e) => e.item && e.folder !== to).map((e) => e.item!);
    const ts = list.filter((e) => e.task && e.folder !== to).map((e) => e.task!.id);
    if (its.length) await moveItems(uid, its, to).catch(() => {});
    if (ts.length) await moveLibTasks(uid, ts, to).catch(() => {});
    await Promise.all(list.filter((e) => e.doc && e.folder !== to).map((e) => setDocPath(e.doc!.id, to))).catch(() => {});
    setSel(new Set());
  };
  // Drag onto a folder (in the pane, the breadcrumbs or the files) to move it there.
  const [dropOn, setDropOn] = useState<string | null>(null);
  const folderDrop = (f: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(MOVE) || inClasses(f)) return; // class folders follow the classes
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
      void moveTo(entries.filter((x) => ids.includes(x.key)), f);
    },
  });
  const dragE = (en: Entry) => (e: React.DragEvent) => {
    if (en.cls) return e.preventDefault();
    const ids = sel.has(en.key) ? selEntries.map((x) => x.key) : [en.key];
    e.dataTransfer.setData(MOVE, ids.join(','));
    e.dataTransfer.effectAllowed = 'move';
  };
  // Editors open full screen in their own tab: Task editor, Sound editor.
  const openHand = (h: HandIn) => void import('../lib/uploads').then(({ fileUrl }) => fileUrl(h.classId, h).then((u) => window.open(u, '_blank')));
  const openE = (en: Entry) => (en.hand ? openHand(en.hand) : en.cls ? void window.open(`/class/${en.cls.classId}/lesson/${en.cls.itemId}`, '_blank') : en.doc ? void window.open(`/doc/${en.doc.id}`, '_blank') : en.task ? openStudio('task', en.task.id) : en.item?.kind === 'audio' && en.item.home && !en.item.link ? openStudio('sound', en.item.id) : setSel(new Set([en.key])));
  const entryMenu = (en: Entry): MenuItem[] => {
    if (sel.has(en.key) && sel.size > 1)
      return [
        ...(selEntries.length ? [{ label: `Move ${selEntries.length} items to…`, icon: 'folder', onClick: () => setMoving(selEntries) } as MenuItem] : []),
        { label: `Download ${sel.size} items`, icon: 'import', onClick: () => void download(selEntries, selFolders) },
        ...(selEntries.length ? ['sep' as const, { label: `Remove ${selEntries.length} from the library`, icon: 'trash', danger: true, onClick: () => void removeE(selEntries) } as MenuItem] : []),
      ];
    if (en.hand)
      return [{ label: 'Open', icon: 'fullscreen', onClick: () => openE(en) }];
    if (en.cls)
      return [
        { label: 'Open', icon: 'fullscreen', onClick: () => openE(en) },
        { label: 'Export as a worksheet…', icon: 'import', onClick: () => setExporting(en.cls!) },
        { label: 'Share with a colleague…', icon: 'person', onClick: () => (setLessonWarned(false), setSharingLesson(en.cls!)) },
      ];
    if (en.doc)
      return [
        { label: 'Open', icon: 'fullscreen', onClick: () => openE(en) },
        { label: COLLAB_KINDS.includes(en.kind) ? 'Share…' : 'Share with colleagues…', icon: 'person', onClick: () => setSharing(en.doc!) },
        { label: 'Rename', icon: 'edit', hint: 'F2', onClick: () => setRenaming(en.key) },
        { label: 'Move to…', icon: 'folder', onClick: () => setMoving([en]) },
        ...(orgFolders.length ? [{ label: 'Copy to the organisation library…', icon: 'copyall', onClick: () => setToOrg(en.doc!) } as MenuItem] : []),
        'sep',
        { label: 'Delete', icon: 'trash', danger: true, onClick: () => void removeE([en]) },
      ];
    return [
      { label: en.task ? 'Edit' : 'Open', icon: en.task ? 'edit' : 'fullscreen', onClick: () => openE(en) },
      { label: 'Rename', icon: 'edit', hint: 'F2', onClick: () => setRenaming(en.key) },
      { label: 'Move to…', icon: 'folder', onClick: () => setMoving([en]) },
      en.item?.link ? { label: 'Open the link', icon: 'link', onClick: () => void downloadItem(en.item!).catch(() => {}) } : { label: en.task ? 'Download as .md' : 'Download', icon: 'import', hint: en.item?.script?.length ? '+ transcript' : undefined, onClick: () => void download([en]) },
      'sep',
      { label: 'Remove from the library', icon: 'trash', danger: true, onClick: () => void removeE([en]) },
    ];
  };
  // Folders in Classes follow the classes: renaming one means renaming the class or topic there.
  const renameF = async (f: string) => {
    if (!inClasses(f)) return setSel(new Set(['f:' + f])), setRenaming('f:' + f);
    const parts = f.split('/');
    const cls = entries.find((e) => e.cls && e.cls.className === parts[1])?.cls;
    if (parts.length < 2 || !cls) return void (await ask('The Classes folder keeps your lessons in step with your classes, so it cannot be renamed here. Rename a class or a topic in the class, and its folder follows.', { ok: 'OK', cancel: '' }));
    const what = parts.length === 2 ? `the class “${parts[1]}”` : `the topic “${parts[parts.length - 1]}” in ${parts[1]}`;
    if (await ask(`This folder follows ${what}. To rename it, rename it in the class: the folder changes with it.`, { ok: 'Open the class', cancel: 'Cancel' })) window.open(`/class/${cls.classId}`, '_blank');
  };
  const folderMenu = (f: string): MenuItem[] => inClasses(f) ? [{ label: 'Open', icon: 'folder', onClick: () => setFolder(f) }, { label: 'Rename…', icon: 'edit', onClick: () => void renameF(f) }] : [
    { label: 'Open', icon: 'folder', onClick: () => setFolder(f) },
    { label: 'New folder inside', icon: 'plus', onClick: () => void newFolder(f) },
    { label: 'Rename', icon: 'edit', hint: 'F2', onClick: () => (setSel(new Set(['f:' + f])), setRenaming('f:' + f)) },
    { label: 'Download everything in it', icon: 'import', disabled: !countIn(f), onClick: () => void download([], [f]) },
    'sep',
    { label: 'Delete the folder', icon: 'trash', danger: true, onClick: () => void deleteF(f) },
  ];
  // A PDF: uploaded into the file itself, then opened to write on.
  const pdfIn = useRef<HTMLInputElement>(null);
  const [pdfBusy, setPdfBusy] = useState('');
  const makePdf = async (f: File) => {
    if (!uid) return;
    if (f.size > MAX_PDF) return void tell('That PDF is larger than 15 MB. Make it smaller first, for example by saving it with smaller pictures.');
    const w = window.open('about:blank', '_blank');
    setPdfBusy('Uploading ' + f.name + '…');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const pages = await pageSizes(await openPdf(bytes));
      const id = await newSharedDoc({ uid, name: user?.displayName || 'Teacher' }, 'pdf', f.name.replace(/\.pdf$/i, ''));
      await saveFilePdf(id, bytes, pages);
      if (folder) await setDocPath(id, folder).catch(() => {});
      if (w) w.location.href = `/doc/${id}`;
    } catch {
      w?.close();
      void tell('That file could not be opened as a PDF.');
    } finally {
      setPdfBusy('');
    }
  };
  const makeDoc = async (k: DocKind) => {
    if (!uid) return;
    const w = window.open('about:blank', '_blank');
    const id = await newSharedDoc({ uid, name: user?.displayName || 'Teacher' }, k);
    if (folder) await setDocPath(id, folder).catch(() => {});
    if (w) w.location.href = `/doc/${id}`;
  };
  const newMenu: MenuItem[] = [
    { label: 'Folder', icon: 'folder', onClick: () => void newFolder() },
    'sep',
    { label: 'Collab document', icon: 'discuss', hint: 'with learners too', onClick: () => void makeDoc('doc') },
    { label: 'Flashcards', icon: 'pick', onClick: () => void makeDoc('flash') },
    { label: 'PD reading', icon: 'notebook', onClick: () => void makeDoc('pd') },
    { label: 'PDF…', icon: 'annotate', hint: 'write on it with others', onClick: () => pdfIn.current?.click() },
    'sep',
    { label: 'Recording', icon: 'mic', onClick: () => setDialog({ tab: 'record' }) },
    { label: 'Recording, with colleagues', icon: 'person', onClick: () => setTogether(true) },
    { label: 'Pictures, recordings or videos…', icon: 'upload', onClick: () => setDialog({ tab: 'upload' }) },
  ];
  const emptyMenu: MenuItem[] = [
    ...newMenu,
    ...(order.length ? ['sep' as const, { label: 'Select everything', icon: 'check', hint: 'Ctrl A', onClick: () => setSel(new Set(order)) } as MenuItem] : []),
  ];
  const clickFolder = (f: string) => (e: React.MouseEvent) => (touch || phone ? setFolder(f) : select('f:' + f, e));
  const clickE = (en: Entry) => (e: React.MouseEvent) => (touch || phone ? openE(en) : select(en.key, e));
  const menuE = (en: Entry) => (e: React.MouseEvent) => (sel.has(en.key) || setSel(new Set([en.key])), openMenu(e, entryMenu(en)));
  const menuF = (f: string) => (e: React.MouseEvent) => (sel.has('f:' + f) || setSel(new Set(['f:' + f])), openMenu(e, folderMenu(f)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (section !== 'media' || editing || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true], .scrim')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') e.preventDefault(), setSel(new Set(order));
      else if (e.key === 'Escape') setSel(new Set());
      else if (e.key.startsWith('Arrow') && order.length) {
        // Arrows move between files; with Shift they select as they go.
        e.preventDefault();
        const from = cursor.current && order.includes(cursor.current) ? cursor.current : anchor.current && order.includes(anchor.current) ? anchor.current : '';
        const to = from ? stepFrom(order, from, e.key) : order[0];
        if (!to) return;
        cursor.current = to;
        if (e.shiftKey && anchor.current && order.includes(anchor.current)) {
          const a = order.indexOf(anchor.current);
          const b = order.indexOf(to);
          setSel(new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1)));
        } else {
          anchor.current = to;
          setSel(new Set([to]));
        }
        document.querySelector(`[data-sel="${CSS.escape(to)}"]`)?.scrollIntoView({ block: 'nearest' });
      } else if ((e.key === 'F2' || e.key === 'Enter') && one && !e.metaKey) {
        e.preventDefault();
        if (e.key === 'Enter' && one.startsWith('f:')) setFolder(one.slice(2));
        else setRenaming(one);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selEntries.length) e.preventDefault(), void removeE(selEntries);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const crumbs = folder ? folder.split('/').map((_, k, a) => a.slice(0, k + 1).join('/')) : [];
  const nameOf = (key: string, text: string, cls = 'ma-name') =>
    renaming === key ? (
      <input
        className={'ma-rename ' + cls}
        defaultValue={text}
        autoFocus
        onFocus={(e) => {
          const v = e.target.value;
          const dot = key.startsWith('f:') ? -1 : -1;
          e.target.setSelectionRange(0, dot > 0 ? dot : v.length);
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setRenaming(null);
        }}
        onBlur={(e) => void doRename(key, e.target.value)}
        aria-label="New name"
      />
    ) : (
      <span className={cls}>{text}</span>
    );

  // ---------------------------------------------------------------- the folder tree
  const Tree = ({ parent, depth }: { parent: string; depth: number }) => (
    <>
      {kidsOf(parent).map((f) => (
        <span key={f} className="ma-folder" style={{ ['--d' as string]: depth }}>
          <button type="button" className={(folder === f ? 'on' : '') + (dropOn === f ? ' drop' : '')} onClick={() => setFolder(f)} onContextMenu={(e) => openMenu(e, folderMenu(f))} {...folderDrop(f)}>
            <FolderIcon size={15} open={folder === f || dropOn === f} locked={inClasses(f)} />
            <span className="ma-fname">{leafOf(f) || 'Untitled folder'}</span> <b>{countIn(f)}</b>
          </button>
          {inTree(folder, f) && <Tree parent={f} depth={depth + 1} />}
        </span>
      ))}
    </>
  );

  const SECTIONS: { k: Section; label: string; icon: string }[] = [
    { k: 'media', label: 'My files', icon: 'archive' },
    { k: 'folders', label: 'Shared folders', icon: 'groups' },
    { k: 'shared', label: 'Shared with me', icon: 'person' },
    { k: 'docs', label: 'In my classes', icon: 'classes' },
  ];
  const editTask = tasks.find((t) => t.id === editing) ?? null;
  // The pane on the right: whatever is selected (one thing).
  const oneEntry = one && !one.startsWith('f:') ? entries.find((e) => e.key === one) ?? null : null;
  const oneFolder = one?.startsWith('f:') ? one.slice(2) : null;
  const pane = section === 'media' && uid && (oneEntry || oneFolder);
  const kindsLabel = !kinds.length ? 'Everything' : kinds.length === 1 ? ALL_KINDS.find((k) => k.k === kinds[0])!.label : `${kinds.length} kinds`;

  const tile = (en: Entry) => <Card key={en.key} entry={en} chosen={sel.has(en.key)} shared={!!en.item && sharedIds.has(en.item.id)} onClick={clickE(en)} onDoubleClick={() => openE(en)} onDragStart={dragE(en)} onMenu={menuE(en)} name={nameOf(en.key, en.name)} />;
  // In the list, a folder opens in place with a click: what is in it shows below, indented.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const folderRows = (f: string, depth: number): React.ReactNode[] => {
    const open = expanded.has(f);
    const head = (
      <button
        key={'f-' + f}
        type="button"
        data-sel={'f:' + f}
        className={'ma-lrow ma-lfolder' + (dropOn === f ? ' drop' : '') + (sel.has('f:' + f) ? ' chosen' : '') + (open ? ' open' : '')}
        onClick={(e) => (clickFolder(f)(e), !e.shiftKey && !e.metaKey && !e.ctrlKey && setExpanded((x) => (x.has(f) ? new Set([...x].filter((y) => y !== f)) : new Set([...x, f]))))}
        onDoubleClick={() => renaming !== 'f:' + f && setFolder(f)}
        onContextMenu={menuF(f)}
        {...folderDrop(f)}
      >
        <span className="ma-lname" style={{ ['--depth' as string]: depth }}>
          <span className={'ma-ltw' + (open ? ' on' : '')} aria-hidden="true">›</span>
          <FolderIcon size={18} locked={inClasses(f)} />
          {nameOf('f:' + f, leafOf(f), 'ma-lname-t')}
        </span>
        <span className="hint">Folder</span>
        <span className="hint">{nItems(countIn(f))}</span>
        <span />
        <span />
      </button>
    );
    if (!open) return [head];
    const files = entries.filter((e) => e.folder === f).sort((a, b) => a.name.localeCompare(b.name));
    return [head, ...kidsOf(f).flatMap((k) => folderRows(k, depth + 1)), ...files.map((en) => row(en, depth + 1))];
  };
  const row = (en: Entry, depth = 0) => (
    <button key={en.key} type="button" data-sel={en.key} draggable={renaming !== en.key} onDragStart={dragE(en)} className={'ma-lrow' + (sel.has(en.key) ? ' chosen' : '')} onClick={clickE(en)} onDoubleClick={() => openE(en)} onContextMenu={menuE(en)}>
      <span className="ma-lname" style={{ ['--depth' as string]: depth }}>
        {en.item && en.kind === 'image' && (en.item.thumb || en.item.link) ? <img className="ma-lthumb" src={en.item.thumb || en.item.link} alt="" draggable={false} /> : <FileIcon kind={en.kind} size={18} label={false} sub={en.cls?.type} />}
        {nameOf(en.key, en.name, 'ma-lname-t')}
        {en.item && sharedIds.has(en.item.id) && <SharedMark />}
        {en.task && en.task.uses.length > 0 && (
          <span className="ma-linked" data-tip={`Linked in ${en.task.uses.length} ${en.task.uses.length === 1 ? 'lesson' : 'lessons'}`}>
            <ChainIcon />
          </span>
        )}
        {(en.item?.tags ?? []).slice(0, 2).map((t) => (
          <span key={t} className="ma-ltag">
            {t}
          </span>
        ))}
      </span>
      <span className="hint">
        {kindName(en.kind)}
        {en.item?.duration ? ' · ' + fmtTime(en.item.duration) : ''}
      </span>
      <span className="hint">{en.task ? (en.task.uses.length ? `${en.task.uses.length} ${en.task.uses.length === 1 ? 'lesson' : 'lessons'}` : '·') : en.item?.link ? 'Link' : formatBytes(en.size)}</span>
      <span className="hint">{en.folder ? leafOf(en.folder) : '·'}</span>
      <span className="hint">{dayOf(en.at)}</span>
    </button>
  );

  return (
    <div className="shell lib-shell">
      <TopBar>
        <MainNav on="archive" />
      </TopBar>
      <div
        className={'ma' + (over ? ' dropping' : '') + (pane ? ' with-detail' : '')}
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
        <aside className="ma-side">
            <nav className="ma-nav ma-places" aria-label="Files">
              {SECTIONS.map((x) => (
                <span key={x.k} style={{ display: 'contents' }}>
                <button type="button" className={section === x.k && (x.k !== 'media' || (folder === '' && !recent)) ? 'on' : ''} aria-current={section === x.k ? 'page' : undefined} onClick={() => (pick(x.k), x.k === 'media' && setFolder(''))} {...(x.k === 'media' ? folderDrop('') : {})}>
                  <UiIcon name={x.icon} size={16} />
                  <span className="ma-fname">{x.label}</span>
                  {x.k === 'media' && <b>{entries.length}</b>}
                </button>
                {x.k === 'media' && (
                  <button type="button" className={section === 'media' && recent ? 'on' : ''} aria-current={section === 'media' && recent ? 'page' : undefined} onClick={() => (pick('media'), setFolderRaw(''), setRecent(true))}>
                    <UiIcon name="timer" size={16} />
                    <span className="ma-fname">Recent</span>
                  </button>
                )}
                </span>
              ))}
            </nav>
            {section === 'media' && (
            <nav className="ma-nav ma-tree" aria-label="Folders">
              <span className="ma-h">Folders</span>
              <Tree parent="" depth={1} />
              <button type="button" className="ma-new" onClick={() => void newFolder()}>
                <UiIcon name="plus" size={14} /> New folder
              </button>
            </nav>
            )}
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
            <div className="ma-space small">
              <span className="ma-space-row">
                <b>{formatBytes(total)}</b>
                <span className="hint">used of {quota.gb} GB</span>
              </span>
              <span className="ma-bar" aria-hidden="true">
                {KINDS.map((k) => {
                  const bytes = all.filter((i) => i.kind === k.k).reduce((s, i) => s + spaceOf(i), 0);
                  return <span key={k.k} className={'k-' + k.k} style={{ width: `${Math.max(bytes ? 0.8 : 0, (bytes / quota.bytes) * 100)}%` }} />;
                })}
                <span className="k-docs" style={{ width: `${Math.max(docBytes ? 0.8 : 0, (docBytes / quota.bytes) * 100)}%` }} />
                <span className="k-lesson" style={{ width: `${Math.max(lessonBytes ? 0.8 : 0, (lessonBytes / quota.bytes) * 100)}%` }} />
              </span>
              <span className="ma-legend">
                {KINDS.map((k) => {
                  const list = all.filter((i) => i.kind === k.k);
                  return (
                    <span key={k.k}>
                      <i className={'k-' + k.k} />
                      {k.label}
                      <b>{list.length ? formatBytes(list.reduce((s, i) => s + spaceOf(i), 0)) : '0'}</b>
                    </span>
                  );
                })}
              </span>
              <span className="ma-legend">
                <span>
                  <i className="k-docs" />
                  Collaborative files
                  <b>{docBytes ? formatBytes(docBytes) : '0'}</b>
                </span>
                <span>
                  <i className="k-lesson" />
                  Lessons
                  <b>{acct?.lessonBytes === undefined ? 'Measuring' : formatBytes(lessonBytes)}</b>
                </span>
              </span>
              <span className="hint small">{quota.org ? `${quota.org} gives you ${quota.gb} GB.` : `Your plan has ${quota.gb} GB for the whole app.`} Lessons, documents, flashcards, reading notes, pictures and recordings all count. Links take no space.</span>
            </div>
          </aside>

        {section === 'docs' && uid && (
          <main className="ma-main">
            <div className="ma-head">
              <div className="ma-head-text">
                <h1 className="page-title">In my classes</h1>
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
                <h1 className="page-title">Shared with me</h1>
                <span className="sub">Files colleagues and others share with you, and what you share.</span>
              </div>
            </div>
            {classLessons.withMe.length > 0 && (
              <section className="fd">
                <h2 className="fd-h">Lessons shared with you</h2>
                <div className="al-grid">
                  {classLessons.withMe.map((l) => (
                    <a key={l.classId + l.itemId} href={`/class/${l.classId}/lesson/${l.itemId}`} target="_blank" rel="noopener" className="al-doc fd-doc k-lesson">
                      <span className="al-doc-art k-lesson">
                        <FileIcon kind="lesson" size={40} />
                      </span>
                      <span className="al-doc-t">
                        <b>{l.title}</b>
                        <span className="al-meta">{l.className}: changes show in the class</span>
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            )}
            <FileDocs uid={uid} mode="shared" />
            <ArchiveShared uid={uid} />
          </main>
        )}
        {section === 'folders' && uid && (
          <main className="ma-main">
            <FileDocs uid={uid} mode="folders" />
          </main>
        )}
        {section === 'colleagues' && <Navigate to="/colleagues" replace />}
        {section === 'media' && (
          <main className="ma-main">
            <div className="ma-head">
              <div className="ma-head-text">
                <nav className="ma-crumbs" aria-label="Where you are">
                  <button type="button" className={folder ? '' : 'here'} onClick={() => setFolder('')} {...folderDrop('')}>
                    My files
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
                <h1 className="page-title">{recent ? 'Recent' : folder ? leafOf(folder) : 'My files'}</h1>
              </div>
              <span className="ma-add">
                <button type="button" className="btn primary" onClick={(e) => openMenu(e, newMenu)} aria-haspopup="menu">
                  + New
                </button>
              </span>
            </div>
            {acct?.over && <div className="ma-full" role="status"><b>Your space is full.</b> New pictures, recordings and files cannot be added until you delete some, or {quota.org ? `${quota.org} gives you more` : 'ask for more space'}.</div>}
            {(upBusy || busy) && <BusyToast text={upBusy || busy} onClose={() => (setBusy(''), setUpBusy(''))} />}
            {/* The selection bar sits over the tools, so nothing below moves when files are picked. */}
            <div className="ma-toolwrap">
            {sel.size > 0 && (
              <div className="ma-selbar">
                <b>{sel.size} selected</b>
                {movable.length > 0 && (
                  <button type="button" className="btn small-btn" onClick={() => setMoving(movable)}>
                    <UiIcon name="folder" size={14} /> Move to…
                  </button>
                )}
                <button type="button" className="btn small-btn" onClick={() => void download(selEntries, selFolders)}>
                  <UiIcon name="import" size={14} /> Download
                </button>
                {one && !fixedOne && (
                  <button type="button" className="btn small-btn" onClick={() => setRenaming(one)}>
                    <UiIcon name="edit" size={14} /> Rename
                  </button>
                )}
                {movable.length > 0 && (
                  <button type="button" className="btn small-btn" onClick={() => void removeE(movable)}>
                    <UiIcon name="trash" size={14} /> Remove
                  </button>
                )}
                <span style={{ flex: 1 }} />
                <button type="button" className="btn link small" onClick={() => setSel(new Set(order))}>
                  Select all
                </button>
                <button type="button" className="btn link small" onClick={() => setSel(new Set())}>
                  Clear
                </button>
              </div>
            )}
              <div className={'ma-bar-row ma-tools' + (sel.size ? ' under' : '')} aria-hidden={sel.size > 0 || undefined}>
                {searching || q ? (
                  <span className="ma-search-wrap">
                    <UiIcon name="search" size={15} />
                    <input className="ma-search" type="search" autoFocus value={q} placeholder={folder ? `Search in ${leafOf(folder)}` : 'Search names, tags and scripts'} onChange={(e) => setQ(e.target.value)} onBlur={() => !q && setSearching(false)} onKeyDown={(e) => e.key === 'Escape' && (setQ(''), setSearching(false))} />
                  </span>
                ) : (
                  <button type="button" className="ma-tool" onClick={() => setSearching(true)} aria-label="Search" data-tip="Search">
                    <UiIcon name="search" size={16} />
                  </button>
                )}
                <span className="ma-filter" ref={filterRef}>
                  <button type="button" className={'ma-tool wide' + (kinds.length ? ' on' : '')} onClick={() => setFilterOpen((v) => !v)} aria-expanded={filterOpen} data-tip="Show only some kinds">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />
                    </svg>
                    {kindsLabel}
                  </button>
                  {filterOpen && (
                    <span className="ma-filter-menu menu" role="menu">
                      <span className="ma-h">Show</span>
                      {ALL_KINDS.map((k) => (
                        <label key={k.k} className="ma-filter-row">
                          <input type="checkbox" checked={!kinds.length || kinds.includes(k.k)} onChange={(e) => {
                            const now = kinds.length ? kinds : ALL_KINDS.map((x) => x.k);
                            const next = e.target.checked ? [...new Set([...now, k.k])] : now.filter((x) => x !== k.k);
                            setKinds(next.length === ALL_KINDS.length ? [] : next);
                          }} />
                          <FileIcon kind={k.k} size={16} label={false} />
                          {k.label}
                          <span className="hint">{entries.filter((e) => e.kind === k.k && inTree(e.folder, folder)).length}</span>
                        </label>
                      ))}
                      {kinds.length > 0 && (
                        <button type="button" className="btn link small" onClick={() => setKinds([])}>
                          Show everything
                        </button>
                      )}
                    </span>
                  )}
                </span>
                {tag && (
                  <button type="button" className="ap-chip on" onClick={() => setTag(null)}>
                    {tag} ×
                  </button>
                )}
                <span style={{ flex: 1 }} />
                <select className="ma-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Order">
                  <option value="new">Newest first</option>
                  <option value="name">By name</option>
                  <option value="type">By kind</option>
                  <option value="size">Largest first</option>
                </select>
                <select className="ma-sort" value={group} onChange={(e) => setGroup(e.target.value as Group)} aria-label="Group">
                  <option value="none">No groups</option>
                  <option value="type">Group by kind</option>
                </select>
                <span className="seg small-seg ma-views" role="radiogroup" aria-label="View">
                  {VIEWS.map((v) => (
                    <button key={v.k} type="button" role="radio" aria-checked={view === v.k} className={view === v.k ? 'on' : ''} onClick={() => setView(v.k)} aria-label={v.label} data-tip={v.label}>
                      <ViewGlyph k={v.k} />
                    </button>
                  ))}
                </span>
              </div>
            </div>
            <div ref={filesRef} className={'ma-files' + (box ? ' boxing' : '')} onPointerDown={marquee} onContextMenu={(e) => !(e.target as HTMLElement).closest('[data-sel]') && openMenu(e, emptyMenu)}>
              {items === null || libTasks === null ? (
                <Loader label="Opening your resources library" />
              ) : shown.length === 0 && subFolders.length === 0 ? (
                <div className="ma-empty">
                  <UiIcon name="archive" size={28} />
                  <strong>{entries.length ? (filtering ? 'Nothing matches' : 'This folder is empty') : 'Your resources library is empty'}</strong>
                  <span className="hint">{filtering ? 'Try another search, kind or tag.' : entries.length ? 'Drop files here, add media, or make a task. Drag items onto a folder to move them.' : 'Pictures, recordings and videos you add to a task appear here. Save tasks here from any lesson, or make new ones, to use again in other lessons.'}</span>
                </div>
              ) : view === 'list' ? (
                <div className="ma-list" role="table" aria-label="Library">
                  <span className="ma-lrow ma-lhead" role="row">
                    <span>Name</span>
                    <span>Kind</span>
                    <span>Size</span>
                    <span>Folder</span>
                    <span>Added</span>
                  </span>
                  {subFolders.flatMap((f) => folderRows(f, 0))}
                  {groups.map(([g, list]) => (
                    <span key={g || 'all'} style={{ display: 'contents' }}>
                      {g && <span className="ma-group-h list">{g}</span>}
                      {list.map((en) => row(en))}
                    </span>
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
                        {list.map((en) => (
                          <span key={en.key} className="ma-tm-it">
                            <span className="ma-tm-day">{dayOf(en.at)}</span>
                            {tile(en)}
                          </span>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <>
                  {/* Folders first, then everything else, in one grid (or one grid per kind when grouped). */}
                  {(group === 'none' ? [['', shown] as [string, Entry[]]] : [['', [] as Entry[]] as [string, Entry[]], ...groups]).map(([g, list], gi) =>
                    gi > 0 || group === 'none' || subFolders.length ? (
                      <section key={g || 'top'} className="ma-group">
                        {g && (
                          <span className="ma-group-h">
                            {g} <span className="hint">{list.length}</span>
                          </span>
                        )}
                        <div className="ma-grid">
                          {gi === 0 &&
                            subFolders.map((f) => (
                              <button key={'f-' + f} type="button" data-sel={'f:' + f} className={'ma-card ma-fcard' + (dropOn === f ? ' drop' : '') + (sel.has('f:' + f) ? ' chosen' : '')} onClick={clickFolder(f)} onDoubleClick={() => renaming !== 'f:' + f && setFolder(f)} onContextMenu={menuF(f)} {...folderDrop(f)}>
                                <span className="ma-thumb ma-fthumb">
                                  <FolderIcon size={46} open={dropOn === f} locked={inClasses(f)} />
                                </span>
                                {nameOf('f:' + f, leafOf(f) || 'Untitled folder')}
                              </button>
                            ))}
                          {list.map(tile)}
                        </div>
                      </section>
                    ) : null,
                  )}
                </>
              )}
              {box && <span className="ma-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} aria-hidden="true" />}
            </div>
          </main>
        )}

        {pane && oneEntry?.item && <Detail key={oneEntry.key} uid={uid!} item={oneEntry.item} folders={allFolders} shared={sharedIds.has(oneEntry.item.id)} onClose={() => setSel(new Set())} />}
        {pane && oneEntry?.cls && (
          <aside className="ma-detail" aria-label={oneEntry.cls.title}>
            <div className="ma-detail-head">
              <span className="pop-type">Lesson</span>
              <button type="button" className="ma-x big" onClick={() => setSel(new Set())} aria-label="Close">
                ×
              </button>
            </div>
            <div className="lt-preview dd" onDoubleClick={() => openE(oneEntry)} title="Double-click to edit the lesson">
              <FileIcon kind="lesson" size={56} />
              <b className="lt-preview-t">{oneEntry.cls.title}</b>
              <span className="ld-where">
                <span className="hint">Where it is</span>
                <span>
                  <b>{oneEntry.cls.className}</b>
                  {oneEntry.cls.topic && <> › {oneEntry.cls.topic}</>}
                </span>
              </span>
              {Object.keys(oneEntry.cls.editors ?? {}).length > 0 && <span className="hint">Shared with {Object.values(oneEntry.cls.editors).join(', ')}</span>}
              <span className="hint">Lessons stay where the class puts them. Move or rename them in the class.</span>
            </div>
            <span className="ma-detail-acts">
              <button type="button" className="btn small-btn primary" onClick={() => openE(oneEntry)}>
                <UiIcon name="edit" size={14} /> Edit the lesson
              </button>
              <button type="button" className="btn small-btn" onClick={() => (setLessonWarned(false), setSharingLesson(oneEntry.cls!))}>
                <UiIcon name="person" size={14} /> Share with a colleague
              </button>
              <button type="button" className="btn small-btn" onClick={() => setExporting(oneEntry.cls!)}>
                <UiIcon name="import" size={14} /> Export
              </button>
            </span>
          </aside>
        )}
        {pane && oneEntry?.doc && (
          <aside className="ma-detail" aria-label={oneEntry.doc.title}>
            <div className="ma-detail-head">
              <span className="pop-type">{kindName(oneEntry.kind)}</span>
              <button type="button" className="ma-x big" onClick={() => setSel(new Set())} aria-label="Close">
                ×
              </button>
            </div>
            <div className="lt-preview dd" onDoubleClick={() => openE(oneEntry)} title="Double-click to open">
              <FileIcon kind={oneEntry.kind} size={56} sub={oneEntry.cls?.type} />
              <b className="lt-preview-t">{oneEntry.doc.title}</b>
              <span className="hint">
                {Object.keys(oneEntry.doc.members ?? {}).length ? `Shared with ${Object.values(oneEntry.doc.members).map((m) => m.name.split(' ')[0]).join(', ')}` : 'Only you'}
                {oneEntry.doc.classes && Object.keys(oneEntry.doc.classes).length ? ` · in ${Object.values(oneEntry.doc.classes).map((c) => c.name).join(', ')}` : ''}
              </span>
              {oneEntry.size > 0 && <span className="hint">{formatBytes(oneEntry.size)}</span>}
              <span className="hint">{COLLAB_KINDS.includes(oneEntry.kind) ? 'Can be shared with colleagues and learners.' : 'Can be shared with other teachers.'}</span>
            </div>
            <span className="ma-detail-acts">
              <button type="button" className="btn small-btn primary" onClick={() => openE(oneEntry)}>
                <UiIcon name="fullscreen" size={14} /> Open
              </button>
              <button type="button" className="btn small-btn" onClick={() => setSharing(oneEntry.doc!)}>
                <UiIcon name="person" size={14} /> Share
              </button>
              <button type="button" className="btn link small" onClick={() => void removeE([oneEntry])}>
                Delete
              </button>
            </span>
          </aside>
        )}
        {pane && oneEntry?.task && <TaskDetail key={oneEntry.key} task={oneEntry.task} onOpen={() => openStudio('task', oneEntry.task!.id)} onDownload={() => downloadTask(oneEntry.task!)} onRemove={() => void removeE([oneEntry])} onClose={() => setSel(new Set())} />}
        {pane && oneFolder && (
          <FolderDetail
            key={oneFolder}
            locked={inClasses(oneFolder)}
            path={oneFolder}
            items={all.filter((i) => inTree(i.folder, oneFolder))}
            tasks={tasks.filter((t) => inTree(t.folder, oneFolder))}
            folders={allFolders.filter((f) => f.startsWith(oneFolder + '/'))}
            onOpen={() => setFolder(oneFolder)}
            onRename={() => void renameF(oneFolder)}
            onDownload={() => void download([], [oneFolder])}
            onDelete={() => void deleteF(oneFolder)}
            onClose={() => setSel(new Set())}
          />
        )}
        {section === 'media' && uid && !oneEntry && !oneFolder && (
          <FolderDetail
            key={'here-' + folder}
            here
            locked={inClasses(folder)}
            path={folder}
            items={all.filter((i) => inTree(i.folder, folder))}
            tasks={tasks.filter((t) => inTree(t.folder, folder))}
            folders={allFolders.filter((f) => (folder ? f.startsWith(folder + '/') : true))}
            extra={[['Lessons, collab documents and more', entries.filter((e) => inTree(e.folder, folder) && (e.cls || e.doc)).length]]}
            onOpen={() => {}}
            onRename={() => void renameF(folder)}
            onDownload={() => void download([], [folder])}
            onDelete={() => void deleteF(folder)}
            onClose={() => {}}
          />
        )}
        <input ref={pdfIn} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (e.target.files?.[0] && void makePdf(e.target.files[0]), (e.target.value = ''))} />
        {pdfBusy && <span className="ma-toast" role="status">{pdfBusy}</span>}
        {exporting && <WorksheetDialog classId={exporting.classId} itemId={exporting.itemId} onClose={() => setExporting(null)} />}
        {dialog && space && <MediaDialog classId={space} tab={dialog.tab} file={dialog.file} folder={folder} noArchive onPictures={(f) => void addPictures(f)} onClose={() => setDialog(null)} onPick={() => setDialog(null)} />}
        {toOrg && <ToOrgDialog d={toOrg} folders={orgFolders} me={{ uid: uid ?? '', name: user?.displayName || 'Teacher' }} onClose={() => setToOrg(null)} />}
        {moving && <MoveDialog folders={allFolders.filter((f) => !inClasses(f))} count={moving.length} from={moving.length === 1 ? moving[0].folder : null} onClose={() => setMoving(null)} onMove={(to) => (void moveTo(moving, to), setMoving(null))} />}
        {sharingLesson && !lessonWarned && (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setSharingLesson(null)}>
          <div className="dialog" role="alertdialog" aria-label="Share the lesson">
            <h2>Share “{sharingLesson.title}”</h2>
            <p>The colleagues you share it with edit the lesson in {sharingLesson.className} itself. Every change they make shows straight away in the class, for you and your learners.</p>
            <div className="row-between" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setSharingLesson(null)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => setLessonWarned(true)}>
                I understand, share it
              </button>
            </div>
          </div>
        </div>
      )}
      {sharingLesson && lessonWarned && dir && (
        <DocSharePeople
          teachersOnly
          noRoles
          title={`Share “${sharingLesson.title}” with colleagues`}
          ownerName={user?.displayName || 'You'}
          members={Object.fromEntries(Object.entries(sharingLesson.editors ?? {}).map(([k, n]) => [k, { role: 'edit' as const, name: n, kind: 'teacher' as const }]))}
          chatLabel="Send them a message with the lesson"
          onShare={(people, _r, tell, note) => shareLesson(sharingLesson, people, dir.me, tell, note)}
          onRemove={(k) => void unshareLesson(sharingLesson, k)}
          onClose={() => setSharingLesson(null)}
        />
      )}
      {sharing && <DocShareDialog d={sharing} onClose={() => setSharing(null)} />}
      {together && <RecordTogether onClose={() => setTogether(false)} />}
        {editTask && uid && <TaskWindow uid={uid} task={editTask} onClose={() => setEditing(null)} />}
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
              {f ? leafOf(f) : 'My files'}
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

function Card({ entry, chosen, shared, name, onClick, onDoubleClick, onDragStart, onMenu }: { entry: Entry; chosen: boolean; shared: boolean; name: ReactNode; onClick: (e: React.MouseEvent) => void; onDoubleClick: () => void; onDragStart: (e: React.DragEvent) => void; onMenu: (e: React.MouseEvent) => void }) {
  const item = entry.item;
  return (
    <button type="button" data-sel={entry.key} className={'ma-card' + (chosen ? ' chosen' : '')} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onMenu} draggable onDragStart={onDragStart} title={entry.task ? `${entry.name}${entry.task.uses.length ? `\nIn ${entry.task.uses.length} ${entry.task.uses.length === 1 ? 'lesson' : 'lessons'}, linked` : ''}` : undefined}>
      <span className={'ma-thumb k-' + entry.kind}>
        {item && item.kind === 'image' && (item.thumb || item.link) ? (
          <img src={item.thumb || item.link} alt="" draggable={false} />
        ) : item?.link && item.kind === 'video' && /youtu/.test(item.link) ? (
          <img src={`https://img.youtube.com/vi/${/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/.exec(item.link)?.[1] ?? ''}/mqdefault.jpg`} alt="" draggable={false} />
        ) : (
          <FileIcon kind={entry.kind} size={42} sub={entry.cls?.type} />
        )}
        {item?.duration ? <span className="ma-dur">{fmtTime(item.duration)}</span> : null}
        <span className="ma-badges">
          {shared && <SharedMark />}
          {entry.task && entry.task.uses.length > 0 && (
            <span className="ma-shared" data-tip={`Linked in ${entry.task.uses.length} ${entry.task.uses.length === 1 ? 'lesson' : 'lessons'}`}>
              <ChainIcon />
            </span>
          )}
          {(item?.script?.length ?? 0) > 0 && (
            <span className="ma-badge" data-tip="Has a transcript">
              <UiIcon name="script" size={11} />
            </span>
          )}
        </span>
      </span>
      {name}
    </button>
  );
}

function months(list: Entry[]): [string, Entry[]][] {
  const m = new Map<string, Entry[]>();
  [...list].sort((a, b) => b.at - a.at).forEach((e) => {
    const k = monthOf(e.at);
    m.set(k, [...(m.get(k) ?? []), e]);
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
  const [dl, setDl] = useState('');
  const [sharing, setSharing] = useState(false);
  const phone = usePhone();

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
          <option value="">My files</option>
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
          <button type="button" className="btn small-btn" onClick={() => openStudio('sound', item.id)}>
            <UiIcon name="edit" size={14} /> Recording editor
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
          <button type="button" className="btn small-btn danger" onClick={() => (archiveRemove(uid, item.id, item).catch(() => {}), onClose())}>
            Remove
          </button>
        </span>
      ) : (
        <button type="button" className="btn link ma-remove" onClick={() => setConfirm(true)}>
          <UiIcon name="trash" size={14} /> Remove from the library
        </button>
      )}
      {script && item.home && <ScriptEditor classId={item.home.classId} mediaId={item.home.mediaId} title={item.name} onClose={() => setScript(false)} onSave={(lines) => archiveUpdate(uid, item, { script: lines })} />}
    </aside>
  );
}

// Work in progress, floating at the foot of the screen so nothing on the page moves: a spinner,
// and a bar when the work is counted ("3 of 8"). A message that is not work in progress can be closed.
function BusyToast({ text, onClose }: { text: string; onClose: () => void }) {
  const m = text.match(/(\d+) of (\d+)/);
  const working = text.includes('…');
  const label = text.replace(/\s*\d+ of \d+$/, '');
  const pct = m ? Math.min(100, (Number(m[1]) / Math.max(1, Number(m[2]))) * 100) : null;
  return createPortal(
    <div className={'busy-toast' + (working ? '' : ' done')} role="status" aria-live="polite">
      {working && <span className="busy-spin" aria-hidden="true" />}
      <span className="busy-body">
        <span className="busy-row">
          <b>{label}</b>
          {m && <span className="hint">{m[1]} of {m[2]}</span>}
        </span>
        {working && <span className={'busy-bar' + (pct === null ? ' loose' : '')}><i style={pct === null ? undefined : { width: `${pct}%` }} /></span>}
      </span>
      {!working && (
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      )}
    </div>,
    document.body,
  );
}

// The next item with the arrow keys, as laid out on the screen: left and right in order, up and
// down to the nearest item in the row above or below.
export function stepFrom(order: string[], from: string, key: string): string {
  const i = order.indexOf(from);
  if (key === 'ArrowLeft') return order[Math.max(0, i - 1)];
  if (key === 'ArrowRight') return order[Math.min(order.length - 1, i + 1)];
  const rect = (k: string) => document.querySelector(`[data-sel="${CSS.escape(k)}"]`)?.getBoundingClientRect();
  const r0 = rect(from);
  if (!r0) return from;
  const down = key === 'ArrowDown';
  let best = '';
  let bestD = Infinity;
  for (const k of order) {
    const r = rect(k);
    if (!r || (down ? r.top <= r0.top + 4 : r.top >= r0.top - 4)) continue;
    const d = Math.abs(r.top - r0.top) * 4 + Math.abs(r.left + r.width / 2 - (r0.left + r0.width / 2));
    if (d < bestD) (bestD = d), (best = k);
  }
  return best || from;
}

// A copy of a file into a folder of the organisation library.
function ToOrgDialog({ d, folders, me, onClose }: { d: SharedDoc; folders: DriveFolder[]; me: { uid: string; name: string }; onClose: () => void }) {
  const [to, setTo] = useState(folders[0]?.id ?? '');
  const [busy, setBusy] = useState('');
  const go = async () => {
    const f = folders.find((x) => x.id === to);
    if (!f) return;
    setBusy('Copying…');
    try {
      await copyFile(d, me, f as unknown as Parameters<typeof copyFile>[2]);
      onClose();
      void tell(`${d.title} is in ${f.name} now. Your own copy stays in your Files.`);
    } catch (e) {
      console.error(e);
      setBusy('The copy could not be made. Try again.');
    }
  };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Copy to the organisation library">
        <h2>Copy to the organisation library</h2>
        <span className="hint">A copy of “{d.title}” goes into the folder. The teachers who can see the folder can use it; your own file stays as it is.</span>
        <Select value={to} options={folders.map((f) => ({ v: f.id, label: f.name }))} onChange={setTo} label="Folder" />
        {busy && <span className="hint">{busy}</span>}
        <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!to || !!busy} onClick={() => void go()}>
            Copy
          </button>
        </span>
      </div>
    </div>
  );
}

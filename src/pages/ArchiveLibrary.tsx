import { ask } from '../lib/ask';
import { exportLesson } from '../lib/textformat';
import { openMenu } from '../components/ContextMenu';
import { FileIcon, type FileKind } from '../components/FileIcon';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { allTeacherClasses, canEdit } from '../lib/coteach';
import { theme } from '../lib/themes';
import type { ClassDoc } from '../lib/classes';
import { hasCollab } from '../lib/copy';
import { Loader } from '../components/Loader';
import { UiIcon } from '../components/UiIcon';
import { CopyDialog } from '../components/CopyDialog';
import { CollabTask, type CollabAttrs } from '../collab/CollabTask';
import { ShareDialog, type ShareWhat } from '../components/ShareDialog';
import { colleagueLink, dropLink, forgetShare, makeColleagueLink, removeColleague, useColleagues, useMyLinks, useMyShares, useSharedWithMe, type Share } from '../lib/sharing';

// The archive's Tasks and Documents: every task and every shared document or deck in all
// your classes, in one place, to find, open and copy.

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };
export type LibTask = { id: string; title: string; instructions: string; classId: string; className: string; itemId: string; itemTitle: string; itemType: string; content?: Node; updated: number; kinds: string[] };
export type LibDoc = { key: string; title: string; kind: 'doc' | 'slides'; scope: string; classId: string; className: string; updated: number; uses: LibTask[]; attrs?: Partial<CollabAttrs> };
type Lib = { classes: ClassDoc[]; tasks: LibTask[]; docs: LibDoc[] };

const ms = (v: unknown) => (v as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
const LABEL: Record<string, string> = { gap: 'Gaps', mcq: 'Choices', match: 'Matching', media: 'Sound or video', collab: 'Shared document', drawboard: 'Board', upload: 'File upload', image: 'Pictures', writing: 'Writing', board: 'Message board' };
function kindsOf(n?: Node, out = new Set<string>()) {
  if (!n) return out;
  if (n.type === 'collab') out.add(n.attrs?.kind === 'slides' ? 'Shared slides' : 'Shared document');
  else if (n.type && LABEL[n.type]) out.add(LABEL[n.type]);
  n.content?.forEach((c) => kindsOf(c, out));
  return out;
}
function collabsOf(n?: Node, out: Node[] = []) {
  if (!n) return out;
  if (n.type === 'collab') out.push(n);
  n.content?.forEach((c) => collabsOf(c, out));
  return out;
}

let cache: Promise<Lib> | null = null;
export function loadLibrary(uid: string, fresh = false): Promise<Lib> {
  if (cache && !fresh) return cache;
  cache = (async () => {
    const classes = (await allTeacherClasses(uid)).filter((c) => c.status !== 'deleted');
    const tasks: LibTask[] = [];
    const docs: LibDoc[] = [];
    await Promise.all(
      classes.map(async (c) => {
        const [items, reg] = await Promise.all([getDocs(collection(db, 'classes', c.id, 'items')).catch(() => null), getDocs(collection(db, 'classes', c.id, 'collabs')).catch(() => null)]);
        await Promise.all(
          (items?.docs ?? []).map(async (it) => {
            const ts = await getDocs(collection(db, 'classes', c.id, 'items', it.id, 'tasks')).catch(() => null);
            for (const t of ts?.docs ?? []) {
              const d = t.data();
              if (d.kind === 'section') continue;
              tasks.push({ id: t.id, title: String(d.title || 'Untitled task'), instructions: String(d.instructions || ''), classId: c.id, className: c.name, itemId: it.id, itemTitle: String(it.data().title || 'Untitled'), itemType: String(it.data().type || 'lesson'), content: d.content, updated: ms(d.updatedAt) || ms(d.createdAt), kinds: [...kindsOf(d.content)] });
            }
          }),
        );
        for (const r of reg?.docs ?? []) {
          const d = r.data();
          docs.push({ key: r.id, title: String(d.title || 'Shared document'), kind: d.kind === 'slides' ? 'slides' : 'doc', scope: String(d.scope || 'class'), classId: c.id, className: c.name, updated: ms(d.updatedAt), uses: [] });
        }
      }),
    );
    // Where each document is used, and the settings of the block that uses it.
    for (const t of tasks)
      for (const n of collabsOf(t.content)) {
        const key = String(n.attrs?.docKey ?? '');
        let d = docs.find((x) => x.key === key && x.classId === t.classId) ?? docs.find((x) => x.key === key);
        if (!d && key) docs.push((d = { key, title: String(n.attrs?.title || 'Shared document'), kind: n.attrs?.kind === 'slides' ? 'slides' : 'doc', scope: String(n.attrs?.scope || 'class'), classId: t.classId, className: t.className, updated: t.updated, uses: [] }));
        if (d) {
          d.uses.push(t);
          d.attrs ??= n.attrs as Partial<CollabAttrs>;
        }
      }
    tasks.sort((a, b) => b.updated - a.updated);
    docs.sort((a, b) => b.updated - a.updated);
    return { classes, tasks, docs };
  })();
  cache.catch(() => (cache = null));
  return cache;
}

export function useLibrary(uid?: string) {
  const [lib, setLib] = useState<Lib | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!uid) return;
    loadLibrary(uid, n > 0).then(setLib, () => setLib({ classes: [], tasks: [], docs: [] }));
  }, [uid, n]);
  return { lib, reload: () => setN((x) => x + 1) };
}

// A task as a text file (the same convention lessons import from).
export const taskMd = (t: LibTask) => exportLesson(t.title, [{ title: t.title, instructions: t.instructions, content: (t.content ?? { type: 'doc', content: [] }) as never }], false);
export function downloadTask(t: LibTask) {
  const text = taskMd(t);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${t.title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Task'}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const SCOPE: Record<string, string> = { class: 'Whole class', group: 'Each group', solo: 'Each learner' };
const TYPE: Record<string, string> = { lesson: 'Lesson', homework: 'Homework', exam: 'Exam', practice: 'Practice' };
const when = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '');

function ClassFilter({ classes, value, onChange }: { classes: ClassDoc[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className="ma-sort" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Class">
      <option value="">All classes</option>
      {classes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function ArchiveTasks({ uid }: { uid: string }) {
  const { lib } = useLibrary(uid);
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [copy, setCopy] = useState<LibTask | null>(null);
  const [sharing, setSharing] = useState<ShareWhat | null>(null);
  const [msg, setMsg] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (lib?.tasks ?? []).filter((t) => (!cls || t.classId === cls) && (!s || `${t.title} ${t.instructions} ${t.itemTitle} ${t.kinds.join(' ')}`.toLowerCase().includes(s)));
  }, [lib, q, cls]);
  if (!lib) return <Loader label="Gathering the tasks in your classes" />;
  const color = (id: string) => theme(lib.classes.find((c) => c.id === id)?.themeColor).accent;
  const editable = (id: string) => {
    const c = lib.classes.find((x) => x.id === id);
    return !!c && canEdit(c, uid);
  };
  return (
    <>
      <div className="ma-bar-row">
        <input className="ma-search" type="search" value={q} placeholder="Search titles, instructions, lessons and question types" onChange={(e) => setQ(e.target.value)} />
        <ClassFilter classes={lib.classes} value={cls} onChange={setCls} />
        <span className="hint">
          {shown.length} {shown.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>
      {msg && <span className="al-msg">{msg}</span>}
      {shown.length === 0 ? (
        <div className="ma-empty">
          <UiIcon name="task" size={28} />
          <strong>{lib.tasks.length ? 'Nothing matches' : 'No tasks yet'}</strong>
          <span className="hint">{lib.tasks.length ? 'Try another search or class.' : 'Tasks you write in any lesson appear here.'}</span>
        </div>
      ) : (
        <div className="al-list">
          {shown.slice(0, 300).map((t) => (
            <div
              key={t.classId + t.id}
              className="al-row"
              style={{ ['--cc' as string]: color(t.classId) }}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: 'Open', icon: 'fullscreen', onClick: () => (window.location.href = `/class/${t.classId}/lesson/${t.itemId}?task=${t.id}`) },
                  ...(editable(t.classId) ? [{ label: 'Copy to…', icon: 'copyall', onClick: () => setCopy(t) }] : []),
                  { label: 'Share…', icon: 'link', onClick: () => setSharing({ kind: 'task', title: t.title, about: t.instructions, src: { classId: t.classId, itemId: t.itemId, taskId: t.id } }) },
                  { label: 'Download as a text file', icon: 'import', hint: '.md', onClick: () => downloadTask(t) },
                ])
              }
            >
              <FileIcon kind="task" size={30} label={false} />
              <span className="al-main">
                <Link to={`/class/${t.classId}/lesson/${t.itemId}?task=${t.id}`} className="al-title">
                  {t.title}
                </Link>
                {t.instructions && <span className="al-sub">{t.instructions}</span>}
                <span className="al-meta">
                  <span className="al-cls">
                    <i />
                    {t.className}
                  </span>
                  <span>
                    {TYPE[t.itemType] ?? 'Lesson'} · {t.itemTitle}
                  </span>
                  {t.kinds.slice(0, 4).map((k) => (
                    <span key={k} className="ld-tag">
                      {k}
                    </span>
                  ))}
                </span>
              </span>
              <span className="al-when hint">{when(t.updated)}</span>
              <span className="al-acts">
                <Link className="btn small-btn" to={`/class/${t.classId}/lesson/${t.itemId}?task=${t.id}`}>
                  Open
                </Link>
                {editable(t.classId) && (
                  <button type="button" className="btn small-btn" onClick={() => setCopy(t)}>
                    Copy to…
                  </button>
                )}
                <button type="button" className="btn small-btn" onClick={() => setSharing({ kind: 'task', title: t.title, about: t.instructions, src: { classId: t.classId, itemId: t.itemId, taskId: t.id } })}>
                  Share…
                </button>
                <button type="button" className="btn small-btn icon-only" onClick={() => downloadTask(t)} aria-label="Download as a text file" data-tip="Download as a text file (.md)">
                  <UiIcon name="import" size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {sharing && <ShareDialog what={sharing} onClose={() => setSharing(null)} />}
      {copy && <CopyDialog kind="task" fromClass={copy.classId} itemId={copy.itemId} taskId={copy.id} title={copy.title} onClose={() => setCopy(null)} onDone={setMsg} />}
    </>
  );
}

export function ArchiveDocs({ uid }: { uid: string }) {
  const { lib } = useLibrary(uid);
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [kind, setKind] = useState<'' | 'doc' | 'slides'>('');
  const [open, setOpen] = useState<LibDoc | null>(null);
  const [sharing, setSharing] = useState<LibDoc | null>(null);
  const [mates, setMates] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    getDocs(collection(db, 'classes', open.classId, 'learners'))
      .then((s) => setMates(s.docs.map((d) => ({ id: d.id, name: String(d.data().displayName ?? '') }))))
      .catch(() => setMates([]));
  }, [open]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (lib?.docs ?? []).filter((d) => (!cls || d.classId === cls) && (!kind || d.kind === kind) && (!s || `${d.title} ${d.className} ${d.uses.map((u) => u.itemTitle).join(' ')}`.toLowerCase().includes(s)));
  }, [lib, q, cls, kind]);
  if (!lib) return <Loader label="Gathering your shared documents" />;
  const color = (id: string) => theme(lib.classes.find((c) => c.id === id)?.themeColor).accent;
  const c = open && lib.classes.find((x) => x.id === open.classId);
  return (
    <>
      <div className="ma-bar-row">
        <input className="ma-search" type="search" value={q} placeholder="Search names, classes and lessons" onChange={(e) => setQ(e.target.value)} />
        <span className="seg small-seg" role="radiogroup" aria-label="Kind">
          {(
            [
              ['', 'All'],
              ['doc', 'Documents'],
              ['slides', 'Slides'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </span>
        <ClassFilter classes={lib.classes} value={cls} onChange={setCls} />
      </div>
      {shown.length === 0 ? (
        <div className="ma-empty">
          <UiIcon name="discuss" size={28} />
          <strong>{lib.docs.length ? 'Nothing matches' : 'No shared documents yet'}</strong>
          <span className="hint">{lib.docs.length ? 'Try another search or class.' : 'Shared documents and slides you add to a task appear here.'}</span>
        </div>
      ) : (
        <div className="al-grid">
          {shown.map((d) => (
            <button key={d.classId + d.key} type="button" className="al-doc" style={{ ['--cc' as string]: color(d.classId) }} onClick={() => setOpen(d)}>
              <span className={'al-doc-art k-' + d.kind}>
                {d.kind === 'slides' ? (
                  <>
                    <i />
                    <i />
                    <b />
                  </>
                ) : (
                  <>
                    <em />
                    <em />
                    <em />
                    <em className="short" />
                  </>
                )}
              </span>
              <span className="al-doc-t">
                <b>{d.title}</b>
                <span className="al-meta">
                  <span className="al-cls">
                    <i />
                    {d.className}
                  </span>
                  <span>{d.kind === 'slides' ? 'Slides' : 'Document'}</span>
                  <span>{SCOPE[d.scope] ?? ''}</span>
                </span>
                <span className="hint">{d.uses.length ? `In ${d.uses.map((u) => `${u.itemTitle} · ${u.title}`).slice(0, 2).join('; ')}${d.uses.length > 2 ? ` and ${d.uses.length - 2} more` : ''}` : 'Not in a task now'}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {sharing && <ShareDialog what={{ kind: 'doc', title: sharing.title, src: { classId: sharing.classId, docKey: sharing.key, docKind: sharing.kind } }} onClose={() => setSharing(null)} />}
      {open && c && (
        <div className="scrim" onClick={() => setOpen(null)}>
          <div className="dialog al-open" role="dialog" aria-label={open.title} onClick={(e) => e.stopPropagation()} style={{ ['--accent' as string]: theme(c.themeColor).accent, ['--accent-text' as string]: theme(c.themeColor).text }}>
            <div className="row-between">
              <span className="al-open-h">
                <h2 style={{ margin: 0 }}>{open.title}</h2>
                <span className="hint">
                  {c.name} · {SCOPE[open.scope]}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn small-btn" onClick={() => (setSharing(open), setOpen(null))}>
                  Share…
                </button>
                {open.uses[0] && (
                  <Link className="btn small-btn" to={`/class/${open.uses[0].classId}/lesson/${open.uses[0].itemId}?task=${open.uses[0].id}`}>
                    Go to the task
                  </Link>
                )}
                <button type="button" className="btn small-btn" onClick={() => setOpen(null)}>
                  Close
                </button>
              </span>
            </div>
            <CollabTask
              a={{ id: open.key, title: open.title, start: null, modes: ['edit', 'suggest', 'comment'], download: true, groupSet: '', ...(open.attrs ?? {}), docKey: open.key, kind: open.kind, scope: (open.scope as CollabAttrs['scope']) || 'class', display: 'inline' }}
              classId={open.classId}
              teacher
              classmates={mates}
            />
          </div>
        </div>
      )}
    </>
  );
}

export const hasDocs = hasCollab;

// Shared with me, and what I share
const SKIND: Record<string, { label: string; icon: string }> = { lesson: { label: 'Lesson', icon: 'task' }, task: { label: 'Task', icon: 'edit' }, doc: { label: 'Shared document', icon: 'discuss' }, media: { label: 'Media', icon: 'picture' } };
export function ArchiveShared({ uid }: { uid: string }) {
  const withMe = useSharedWithMe(uid);
  const mine = useMyShares(uid);
  const colleagues = useColleagues(uid);
  const [tab, setTab] = useState<'in' | 'out'>('in');
  const [managing, setManaging] = useState<Share | null>(null);
  const nameOf = (id: string) => colleagues?.find((c) => c.id === id)?.name.split(' ')[0] ?? 'a colleague';
  const list = tab === 'in' ? withMe : mine;
  return (
    <>
      <div className="ma-bar-row">
        <span className="seg small-seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'in'} className={tab === 'in' ? 'on' : ''} onClick={() => setTab('in')}>
            Shared with me {withMe?.length ? `(${withMe.length})` : ''}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'out'} className={tab === 'out' ? 'on' : ''} onClick={() => setTab('out')}>
            Shared by me {mine?.length ? `(${mine.length})` : ''}
          </button>
        </span>
      </div>
      {list === null ? (
        <Loader label="Opening" />
      ) : list.length === 0 ? (
        <div className="ma-empty">
          <UiIcon name="link" size={28} />
          <strong>{tab === 'in' ? 'Nothing shared with you yet' : 'You have not shared anything yet'}</strong>
          <span className="hint">{tab === 'in' ? 'When a colleague shares a lesson, task, document or media with you, or you open a link they send, it shows here.' : 'Share a lesson from its menu on the class page, or a task, document or media from here in the archive.'}</span>
        </div>
      ) : (
        <div className="al-list">
          {list.map((s) => (
            <div key={s.id} className="al-row" style={{ ['--cc' as string]: 'var(--accent)' }}>
              <FileIcon kind={(s.kind ?? 'lesson') as FileKind} size={30} label={false} />
              <span className="al-main">
                <Link to={`/s/${s.id}`} className="al-title">
                  {s.title}
                </Link>
                <span className="al-meta">
                  <span>{SKIND[s.kind ?? 'lesson'].label}</span>
                  {tab === 'in' ? (
                    <span>from {s.ownerName}</span>
                  ) : (
                    <span>{(s as Share).mode === 'link' ? 'Anyone with the link' : `With ${((s as Share).people ?? []).map(nameOf).join(', ') || 'no one yet'}`}</span>
                  )}
                  <span className="ld-tag">Read-only</span>
                </span>
              </span>
              <span className="al-when hint">{when(s.updated ?? s.at ?? 0)}</span>
              <span className="al-acts">
                <Link className="btn small-btn" to={`/s/${s.id}`}>
                  Open
                </Link>
                {tab === 'out' ? (
                  <button type="button" className="btn small-btn" onClick={() => setManaging(s as Share)}>
                    Manage
                  </button>
                ) : (
                  !(s as Share).people?.includes(uid) && (
                    <button type="button" className="btn small-btn" onClick={() => forgetShare(uid, s.id)} data-tip="Take it off this list">
                      Remove
                    </button>
                  )
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {managing && <ShareDialog what={{ kind: managing.kind, title: managing.title, src: managing.src, item: managing.item, archive: managing.archive }} onClose={() => setManaging(null)} />}
    </>
  );
}

export function ArchiveColleagues({ uid, me, inviteOnly }: { uid: string; me: { name: string; email: string }; inviteOnly?: boolean }) {
  const colleagues = useColleagues(uid);
  const links = useMyLinks(uid);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const fresh = links[0];
  const copy = (t: string) => navigator.clipboard?.writeText(colleagueLink(t)).then(() => (setCopied(t), window.setTimeout(() => setCopied(''), 1800)));
  const make = async () => {
    setBusy(true);
    try {
      const t = await makeColleagueLink({ uid, ...me });
      copy(t);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cl">
      <section className="cl-invite">
        <span className="cl-invite-t">
          <b>Invite a colleague</b>
          <span className="hint">Send them a link. When they open it and accept, you become colleagues and can share with each other. Nobody can find you by searching.</span>
        </span>
        {fresh ? (
          <span className="sh-link">
            <input readOnly value={colleagueLink(fresh.id)} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn small-btn" onClick={() => copy(fresh.id)}>
              {copied === fresh.id ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className="btn small-btn" onClick={() => dropLink(fresh.id)} data-tip="Stop this link working">
              End link
            </button>
          </span>
        ) : (
          <button type="button" className="btn primary" disabled={busy} onClick={make}>
            {busy ? 'Making a link…' : 'Make an invitation link'}
          </button>
        )}
        {fresh && (
          <button type="button" className="btn link" disabled={busy} onClick={make}>
            Make another link
          </button>
        )}
      </section>
      {!inviteOnly && (<>
      <span className="eyebrow">Your colleagues {colleagues?.length ? `· ${colleagues.length}` : ''}</span>
      {colleagues === null ? (
        <Loader label="Opening" />
      ) : colleagues.length === 0 ? (
        <span className="hint">No colleagues yet.</span>
      ) : (
        <div className="cl-list">
          {colleagues.map((c) => (
            <div key={c.id} className="cl-row">
              <span className="sh-av">{c.name.trim().slice(0, 1).toUpperCase()}</span>
              <span className="sh-pt">
                <b>{c.name}</b>
                <span className="hint">
                  {c.email}
                  {c.at ? ` · since ${when(c.at)}` : ''}
                </span>
              </span>
              <button type="button" className="btn link small" onClick={() => void ask(`Stop being colleagues with ${c.name}? Things already shared stay shared until you stop sharing them.`).then((ok) => { if (ok) removeColleague(uid, c.id); })}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      </>)}
      {links.length > 1 && (
        <span className="hint">
          {links.length} invitation links are open.{' '}
          <button type="button" className="btn link small" onClick={() => links.slice(1).forEach((l) => dropLink(l.id))}>
            End the older ones
          </button>
        </span>
      )}
    </div>
  );
}

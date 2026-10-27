import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { JSONContent } from '@tiptap/react';
import { TaskEditor } from '../editor/TaskEditor';
import { InstrEditor } from '../editor/InstrEditor';
import { TaskRenderer } from '../components/TaskRenderer';
import { FileIcon, FolderIcon } from '../components/FileIcon';
import { UiIcon } from '../components/UiIcon';
import { parseUse, updateLibTask, type LibTask } from '../lib/libtasks';
import { splitKey } from '../lib/questions';
import { formatBytes, leafOf, type ArchiveItem } from '../lib/archive';

// The library's own parts for tasks and folders: a window to edit a task, and the pane on the
// right for a chosen task or folder.

const LABEL: Record<string, string> = { gap: 'Gaps', choice: 'Choices', mcq: 'Choices', match: 'Matching', media: 'Sound or video', collab: 'Shared document', image: 'Pictures', writing: 'Writing', table: 'Table', dialogue: 'Dialogue', textBox: 'Text box' };
export function kindsIn(n?: JSONContent | null, out = new Set<string>()) {
  if (!n) return out;
  if (n.type && LABEL[n.type]) out.add(LABEL[n.type]);
  n.content?.forEach((c) => kindsIn(c, out));
  return out;
}
const when = (t: number) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// Edit a task right in the library. Changes save as you go and reach every lesson that uses it.
export function TaskWindow({ uid, task, onClose }: { uid: string; task: LibTask; onClose: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [instr, setInstr] = useState<{ doc: JSONContent | null; text: string }>({ doc: task.instrDoc ?? null, text: task.instructions });
  const [content, setContent] = useState<JSONContent>(task.content);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const pending = useRef<Partial<{ title: string; instructions: string; instrDoc: JSONContent | null; content: JSONContent }> | null>(null);
  const timer = useRef(0);
  const flush = async () => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    try {
      await updateLibTask(uid, task.id, p);
      setStatus(pending.current ? 'saving' : 'saved');
    } catch {
      setStatus('error');
    }
  };
  const change = (p: NonNullable<typeof pending.current>) => {
    pending.current = { ...(pending.current ?? {}), ...p };
    setStatus('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 800);
  };
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = async () => {
    await flush();
    onClose();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement).closest('.ProseMirror') && void close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  return createPortal(
    <div className="scrim lt-scrim" onMouseDown={(e) => e.target === e.currentTarget && void close()}>
      <div className="dialog lt-window" role="dialog" aria-label={`Edit ${task.title}`}>
        <div className="lt-head">
          <FileIcon kind="task" size={26} label={false} />
          <span className="lt-where">
            Resources library{task.folder ? ` › ${task.folder.split('/').join(' › ')}` : ''}
            {task.uses.length > 0 && (
              <span className="lib-link small">
                <ChainIcon /> In {task.uses.length} {task.uses.length === 1 ? 'lesson' : 'lessons'}: changes reach {task.uses.length === 1 ? 'it' : 'them all'}
              </span>
            )}
          </span>
          <span className={'lt-status ' + status}>{status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : 'Saved'}</span>
          <button type="button" className="icon-btn" onClick={() => void close()} aria-label="Close" data-tip="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="lt-body">
          <div className="frame-head">
            <input className="task-title input" value={title} placeholder="Task title" aria-label="Task title" onChange={(e) => (setTitle(e.target.value), change({ title: e.target.value }))} />
            <InstrEditor doc={instr.doc} text={instr.text} onChange={(d, t) => (setInstr({ doc: d, text: t }), change({ instrDoc: d, instructions: t }))} />
          </div>
          <div className="frame-body">
            <TaskEditor content={content} onChange={(c) => (setContent(c), change({ content: c }))} classId={'user:' + uid} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const ChainIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);
export const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

// The lessons a task is in, with their names.
function useUses(task: LibTask) {
  const [rows, setRows] = useState<{ key: string; lesson: string; cls: string; classId: string; itemId: string; taskId: string }[] | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all(
      task.uses.map(async (k) => {
        const u = parseUse(k);
        const [it, c] = await Promise.all([getDoc(doc(db, 'classes', u.classId, 'items', u.itemId)).catch(() => null), getDoc(doc(db, 'classes', u.classId)).catch(() => null)]);
        return { key: k, ...u, lesson: String(it?.data()?.title ?? 'A lesson'), cls: String(c?.data()?.name ?? 'A class') };
      }),
    ).then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, [task.uses.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

export function TaskDetail({ task, onOpen, onDownload, onRemove, onClose }: { task: LibTask; onOpen: () => void; onDownload: () => void; onRemove: () => void; onClose: () => void }) {
  const uses = useUses(task);
  const kinds = [...kindsIn(task.content)];
  return (
    <aside className="ma-detail" aria-label={task.title}>
      <div className="ma-detail-head">
        <span className="pop-type">Task</span>
        <button type="button" className="ma-x big" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="lt-preview" onDoubleClick={onOpen} title="Double-click to edit">
        <b className="lt-preview-t">{task.title}</b>
        {task.instructions && <span className="hint">{task.instructions}</span>}
        <div className="lt-preview-body doc">
          <TaskRenderer content={splitKey(task.content).content} responses={{}} onChange={() => {}} disabled classId="" />
        </div>
      </div>
      <span className="ma-detail-acts">
        <button type="button" className="btn small-btn primary" onClick={onOpen}>
          <UiIcon name="edit" size={14} /> Edit
        </button>
        <button type="button" className="btn small-btn" onClick={onDownload}>
          <UiIcon name="import" size={14} /> Download .md
        </button>
      </span>
      {kinds.length > 0 && (
        <span className="ma-card-tags lt-kinds">
          {kinds.map((k) => (
            <span key={k}>{k}</span>
          ))}
        </span>
      )}
      <dl className="ma-facts">
        <dt>Folder</dt>
        <dd>{task.folder ? leafOf(task.folder) : 'Resources library'}</dd>
        <dt>Changed</dt>
        <dd>{when(task.updatedAt)}</dd>
        <dt>Added</dt>
        <dd>{when(task.createdAt)}</dd>
        <dt>Used in</dt>
        <dd>{task.uses.length ? `${task.uses.length} ${task.uses.length === 1 ? 'lesson' : 'lessons'}, linked` : 'No lesson yet'}</dd>
      </dl>
      {task.uses.length > 0 && (
        <div className="ma-uses">
          {uses === null ? (
            <span className="hint">Finding the lessons…</span>
          ) : (
            uses.map((u) => (
              <Link key={u.key} to={`/class/${u.classId}/lesson/${u.itemId}?task=${u.taskId}`} className="ma-use">
                <FileIcon kind="lesson" size={22} label={false} />
                <span>
                  <b>{u.lesson}</b>
                  <span className="hint">
                    {u.cls} · <ChainIcon /> linked
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>
      )}
      <button type="button" className="btn link ma-remove" onClick={onRemove}>
        <UiIcon name="trash" size={14} /> Remove from the library
      </button>
    </aside>
  );
}

export function FolderDetail({ path, items, tasks, folders, onOpen, onRename, onDownload, onDelete, onClose }: { path: string; items: ArchiveItem[]; tasks: LibTask[]; folders: string[]; onOpen: () => void; onRename: () => void; onDownload: () => void; onDelete: () => void; onClose: () => void }) {
  const size = items.reduce((s, i) => s + (i.size || 0), 0);
  const by = (k: string) => items.filter((i) => i.kind === k).length;
  const rows: [string, number][] = [
    ['Pictures', by('image')],
    ['Recordings', by('audio')],
    ['Videos', by('video')],
    ['Tasks', tasks.length],
    ['Folders', folders.length],
  ];
  return (
    <aside className="ma-detail" aria-label={leafOf(path)}>
      <div className="ma-detail-head">
        <span className="pop-type">Folder</span>
        <button type="button" className="ma-x big" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="lt-folder" onDoubleClick={onOpen}>
        <FolderIcon size={64} />
        <b>{leafOf(path)}</b>
        <span className="hint">{path.includes('/') ? path.split('/').slice(0, -1).join(' › ') : 'In the resources library'}</span>
      </div>
      <span className="ma-detail-acts">
        <button type="button" className="btn small-btn primary" onClick={onOpen}>
          Open
        </button>
        <button type="button" className="btn small-btn" onClick={onRename}>
          <UiIcon name="edit" size={14} /> Rename
        </button>
        <button type="button" className="btn small-btn" onClick={onDownload} disabled={!items.length && !tasks.length}>
          <UiIcon name="import" size={14} /> Download
        </button>
      </span>
      <dl className="ma-facts">
        {rows.map(([l, n]) => (
          <span key={l} style={{ display: 'contents' }}>
            <dt>{l}</dt>
            <dd>{n}</dd>
          </span>
        ))}
        <dt>Space</dt>
        <dd>{formatBytes(size)}</dd>
      </dl>
      <button type="button" className="btn link ma-remove" onClick={onDelete}>
        <UiIcon name="trash" size={14} /> Delete the folder
      </button>
    </aside>
  );
}

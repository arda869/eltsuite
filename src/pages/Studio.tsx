import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { Wordmark } from '../components/Wordmark';
import { Loader } from '../components/Loader';
import { TaskEditor } from '../editor/TaskEditor';
import { InstrEditor } from '../editor/InstrEditor';
import { updateLibTask, type LibTask } from '../lib/libtasks';
import { findUses, loadManifest, replaceSound, soundUrl, useArchive } from '../lib/archive';
import { decodeSound } from '../lib/sound';
import { SoundEditor, type SoundSource } from '../media/SoundEditor';
import { ChainIcon } from './LibraryParts';

// The studios: full-screen editors that open in their own tab, with room to work.
// Task editor (a task in the resources library) and Sound editor (a sound in the library).

function StudioBar({ app, where, status, children }: { app: string; where: ReactNode; status?: ReactNode; children?: ReactNode }) {
  useEffect(() => {
    const old = document.title;
    document.title = `${app} · ELT Suite`;
    return () => void (document.title = old);
  }, [app]);
  return (
    <header className="studio-bar">
      <Link to="/archive" className="studio-brand" aria-label="ELT Suite">
        <Wordmark />
      </Link>
      <span className="studio-app">{app}</span>
      <span className="studio-where">{where}</span>
      <span style={{ flex: 1 }} />
      {status}
      {children}
      <button type="button" className="btn small-btn" onClick={() => (window.opener ? window.close() : (window.location.href = '/archive'))}>
        Done
      </button>
    </header>
  );
}

export function TaskStudio() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const uid = user?.uid;
  const [task, setTask] = useState<LibTask | null | undefined>(undefined);
  const [draft, setDraft] = useState<{ title: string; instructions: string; instrDoc: JSONContent | null; content: JSONContent } | null>(null);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'users', uid, 'libTasks', id),
      (s) => {
        if (!s.exists()) return setTask(null);
        const x = s.data() as Partial<LibTask>;
        setTask({ id: s.id, title: x.title ?? 'Task', instructions: x.instructions ?? '', instrDoc: x.instrDoc ?? null, content: x.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }, folder: x.folder ?? '', uses: x.uses ?? [], createdAt: x.createdAt ?? 0, updatedAt: x.updatedAt ?? 0 });
      },
      () => setTask(null),
    );
  }, [uid, id]);
  // The draft is taken once; after that, what you type is the truth here.
  useEffect(() => {
    if (task && !draft) setDraft({ title: task.title, instructions: task.instructions, instrDoc: task.instrDoc ?? null, content: task.content });
  }, [task, draft]);
  const pending = useRef<Record<string, unknown> | null>(null);
  const timer = useRef(0);
  const flush = async () => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    if (!p || !uid) return;
    pending.current = null;
    try {
      await updateLibTask(uid, id, p);
      setStatus(pending.current ? 'saving' : 'saved');
    } catch {
      setStatus('error');
    }
  };
  const change = (p: Partial<NonNullable<typeof draft>>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    pending.current = { ...(pending.current ?? {}), ...p };
    setStatus('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 800);
  };
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (pending.current) void flush(), e.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  });
  if (task === undefined || (task && !draft)) return <Loader label="Opening the task" />;
  if (task === null || !draft)
    return (
      <div className="studio">
        <StudioBar app="Task editor" where="Not found" />
        <p className="hint studio-missing">This task is no longer in your resources library.</p>
      </div>
    );
  return (
    <div className="studio">
      <StudioBar
        app="Task editor"
        where={
          <>
            Resources library{task.folder ? ` › ${task.folder.split('/').join(' › ')}` : ''}
            {task.uses.length > 0 && (
              <span className="lib-link small">
                <ChainIcon /> In {task.uses.length} {task.uses.length === 1 ? 'lesson' : 'lessons'}: changes reach {task.uses.length === 1 ? 'it' : 'them all'}
              </span>
            )}
          </>
        }
        status={<span className={'lt-status ' + status}>{status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : 'Saved'}</span>}
      />
      <main className="studio-task">
        <div className="frame-inner studio-sheet">
          <div className="frame-head">
            <input className="task-title input" value={draft.title} placeholder="Task title" aria-label="Task title" onChange={(e) => change({ title: e.target.value })} />
            <InstrEditor doc={draft.instrDoc} text={draft.instructions} onChange={(d, t) => change({ instrDoc: d, instructions: t })} />
          </div>
          <div className="frame-body">
            <TaskEditor content={draft.content} onChange={(c) => change({ content: c })} classId={'user:' + uid} />
          </div>
        </div>
      </main>
    </div>
  );
}

export function SoundStudio() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const uid = user?.uid;
  const items = useArchive(uid);
  const item = items?.find((i) => i.id === id) ?? (items ? null : undefined);
  const [source, setSource] = useState<SoundSource | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const opened = useRef(false);
  useEffect(() => {
    if (!item || !item.home || opened.current) return;
    opened.current = true;
    (async () => {
      try {
        const m = await loadManifest(item.home!.classId, item.home!.mediaId);
        if (!m) throw new Error('missing');
        const url = await soundUrl(item.home!.classId, item.home!.mediaId, m);
        const buffer = await decodeSound(await (await fetch(url)).blob());
        const lines = item.script ?? m.script ?? [];
        setSource({ buffer, name: item.name, script: lines.map((l) => l.text), marks: lines.map((l) => (l.t === null ? NaN : l.t)) });
      } catch {
        setError('The sound could not be opened.');
      }
    })();
  }, [item]);
  return (
    <div className="studio studio-dark">
      <StudioBar app="Sound editor" where={item ? `Resources library${item.folder ? ` › ${item.folder.split('/').join(' › ')}` : ''} › ${item.name}` : ''} />
      <main className="studio-sound">
        {item === undefined || (item && !source && !error) ? (
          <Loader label="Opening the sound" />
        ) : item === null || error ? (
          <p className="hint studio-missing">{error || 'This sound is no longer in your resources library.'}</p>
        ) : done ? (
          <div className="studio-done">
            <strong>Saved</strong>
            <span className="hint">The library and every lesson that uses it have the new version.</span>
            <button type="button" className="btn primary" onClick={() => (window.opener ? window.close() : (window.location.href = '/archive'))}>
              Done
            </button>
          </div>
        ) : (
          source &&
          item && uid && (
            <SoundEditor
              source={source}
              classId={'user:' + uid}
              folder={item.folder}
              backLabel="Close without saving"
              onBack={() => (window.opener ? window.close() : (window.location.href = '/archive'))}
              onSaved={() => setDone(true)}
              replace={{ name: item.name, uses: () => findUses(item), run: (blob, meta, p) => replaceSound(uid, item, blob, meta, p) }}
            />
          )
        )}
      </main>
    </div>
  );
}

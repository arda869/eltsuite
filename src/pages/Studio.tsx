import { HelpMenu } from '../help/HelpMenu';
import { ScriptEditor } from '../media/ScriptEditor';
import { saveScript } from '../editor/MediaNode';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { Wordmark } from '../components/Wordmark';
import { Loader } from '../components/Loader';
import { TaskEditor } from '../editor/TaskEditor';
import { InstrEditor } from '../editor/InstrEditor';
import { updateLibTask, type LibTask } from '../lib/libtasks';
import { findUses, loadManifest, replaceSound, soundUrl, useArchive, type ArchiveItem, type Manifest } from '../lib/archive';
import { decodeSound } from '../lib/sound';
import { SoundEditor, type SoundSource } from '../media/SoundEditor';
import { ChainIcon } from './LibraryParts';
import { setFileFavicon } from '../components/FileIcon';

// The studios: full-screen editors that open in their own tab, with room to work.
// Task editor (a task in the resources library) and Sound editor (a sound in the library).

function StudioBar({ app, where, status, children }: { app: string; where: ReactNode; status?: ReactNode; children?: ReactNode }) {
  useEffect(() => {
    const old = document.title;
    document.title = `${app} · ELT Suite`;
    setFileFavicon(/sound|record/i.test(app) ? 'audio' : 'task');
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
      <HelpMenu />
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
            <InstrEditor classId={'user:' + uid} doc={draft.instrDoc} text={draft.instructions} onChange={(d, t) => change({ instrDoc: d, instructions: t })} />
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
  const [query] = useSearchParams();
  const { user } = useAuth();
  const uid = user?.uid;
  const items = useArchive(uid);
  const archived = items?.find(i => i.id === id);
  const classId = query.get('class') || archived?.home?.classId || '';
  const mediaId = query.get('media') || archived?.home?.mediaId || '';
  const [source, setSource] = useState<SoundSource | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const opened = useRef('');
  const finish = () => window.opener ? window.close() : (window.location.href = '/recordings');
  useEffect(() => {
    if (!classId || !mediaId || opened.current === classId + '/' + mediaId) return;
    opened.current = classId + '/' + mediaId;
    let active = true;
    (async () => {
      try {
        const m = await loadManifest(classId, mediaId);
        if (!m) throw Error('missing');
        if (!active) return;
        setManifest(m);
        if (m.kind === 'link' || m.video) return;
        const url = await soundUrl(classId, mediaId, m);
        const response = await fetch(url);
        if (!response.ok) throw Error('unavailable');
        const buffer = await decodeSound(await response.blob());
        let stems: {vocals:AudioBuffer;instrumental:AudioBuffer}|undefined;
        if(m.stems){
          const read=async(id:string)=>{const manifest=await loadManifest(classId,id);if(!manifest)throw Error('missing stem');const response=await fetch(await soundUrl(classId,id,manifest));if(!response.ok)throw Error('unavailable stem');return decodeSound(await response.blob());};
          const [vocals,instrumental]=await Promise.all([read(m.stems.vocals),read(m.stems.instrumental)]);stems={vocals,instrumental};
        }
        if (active) setSource({ buffer:stems?.vocals||buffer, name: (archived?.name || m.title || 'Recording')+(stems?' · Vocals':''), timedScript: m.script ?? archived?.script ?? [],...(stems?{songStems:true,extra:[{name:'Sing-along backing',buffer:stems.instrumental,at:0}]}:{}) });
      } catch { if (active) setError('We couldn’t open this recording. Check that you have access to its lesson and try again.'); }
    })();
    return () => { active = false; opened.current = ''; };
  }, [classId, mediaId]);
  // Include the lesson copy even when a legacy resource omitted it from its copy map.
  const item: ArchiveItem | null = manifest ? archived ? { ...archived, copies: { ...archived.copies, ...(archived.home?.classId !== classId ? { [classId]: mediaId } : {}) } } : {
    id: '', kind: 'audio', name: manifest.title || 'Recording', folder: '', tags: [], size: 0, createdAt: 0, home: { classId, mediaId },
  } : null;
  const missing = !!items && (!classId || !mediaId);
  const saveLines = (lines: import('../lib/archive').ScriptLine[]) => saveScript(uid, classId, mediaId, archived?.id || '', lines);
  if (error || missing) return <div className="studio"><StudioBar app="Recordings" where="Recording unavailable" /><p className="hint studio-missing">{error || 'This recording is no longer available.'}</p></div>;
  if (done) return <div className="studio"><StudioBar app="Recordings" where="Saved" /><div className="studio-done"><strong>Saved</strong><span className="hint">The linked lessons have the updated recording and script.</span><button type="button" className="btn primary" onClick={finish}>Done</button></div></div>;
  if (manifest && (manifest.kind === 'link' || manifest.video)) return <div className="studio"><StudioBar app="Recordings" where={archived?.name || manifest.title || 'Script and timing'} /><ScriptEditor embedded classId={classId} mediaId={mediaId} manifest={manifest} title={archived?.name || manifest.title} onSave={saveLines} onClose={finish} /></div>;
  return <div className="studio studio-dark"><main className="studio-sound">{source && item && uid ? <SoundEditor
    source={source} classId={classId} folder={item.folder} backLabel="Close without saving" onBack={finish} onSaved={() => setDone(true)} onSaveScript={saveLines}
    replace={{ name: item.name, uses: () => findUses(item), run: (blob, meta, progress) => replaceSound(uid, item, blob, meta, progress) }}
  /> : <Loader label="Opening the recording" />}</main></div>;
}

import { useEffect, useState } from 'react';
import { listVersions, splitKey, type Version } from '../lib/tasks';
import { TaskRenderer } from './TaskRenderer';

// Earlier versions of a task: preview any of them and restore it.
export function VersionsDialog({ classId, itemId, taskId, onClose, onRestore }: { classId: string; itemId: string; taskId: string; onClose: () => void; onRestore: (v: Version) => Promise<void> }) {
  const [list, setList] = useState<Version[] | null>(null);
  const [sel, setSel] = useState<Version | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    listVersions(classId, itemId, taskId)
      .then((l) => (setList(l), setSel(l[0] ?? null)))
      .catch(() => setList([]));
  }, [classId, itemId, taskId]);
  const when = (v: Version) => (v.at?.toMillis ? new Date(v.at.toMillis()).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now');
  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog versions-dialog" role="dialog" aria-label="Version history" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Version history</h2>
        {list === null ? (
          <span className="hint">Loading…</span>
        ) : list.length === 0 ? (
          <span className="hint">No earlier versions yet. A version is kept every few minutes while you edit.</span>
        ) : (
          <div className="versions-grid">
            <ul className="versions-list">
              {list.map((v) => (
                <li key={v.id}>
                  <button type="button" className={sel?.id === v.id ? 'on' : ''} onClick={() => setSel(v)}>
                    <strong>{when(v)}</strong>
                    <span className="hint">{v.by || ' '}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="versions-preview">
              {sel && (
                <>
                  <h3 className="task-title">{sel.title}</h3>
                  {sel.instructions && <p className="task-instr">{sel.instructions}</p>}
                  <TaskRenderer content={splitKey(sel.content).content} responses={{}} disabled />
                </>
              )}
            </div>
          </div>
        )}
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button
            className="btn primary"
            disabled={!sel || busy}
            onClick={async () => {
              if (!sel) return;
              setBusy(true);
              await onRestore(sel).finally(() => setBusy(false));
            }}
          >
            Restore this version
          </button>
        </span>
      </div>
    </div>
  );
}

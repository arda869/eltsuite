import { useMemo, useState } from 'react';
import { useLibTasks, type LibTask } from '../lib/libtasks';
import { FileIcon, FolderIcon } from './FileIcon';
import { UiIcon } from './UiIcon';

// Choose a task from the resources library to add to a lesson. It is added linked.
export function LibraryPicker({ uid, onPick, onClose }: { uid: string; onPick: (t: LibTask) => void; onClose: () => void }) {
  const list = useLibTasks(uid);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const folders = useMemo(() => [...new Set((list ?? []).map((t) => t.folder).filter(Boolean))].sort(), [list]);
  const s = q.trim().toLowerCase();
  const shown = (list ?? []).filter((t) => (folder === null || t.folder === folder) && (!s || `${t.title} ${t.instructions}`.toLowerCase().includes(s))).sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog lp-dialog" role="dialog" aria-label="From the resources library">
        <h2 style={{ margin: 0 }}>From the resources library</h2>
        <span className="hint">The task is added linked: change it here or in the library and both follow. You can break the link later.</span>
        <input className="ma-search" type="search" autoFocus value={q} placeholder="Search tasks" onChange={(e) => setQ(e.target.value)} />
        {folders.length > 0 && (
          <span className="lp-folders">
            <button type="button" className={'ap-chip' + (folder === null ? ' on' : '')} onClick={() => setFolder(null)}>
              Everything
            </button>
            {folders.map((f) => (
              <button key={f} type="button" className={'ap-chip' + (folder === f ? ' on' : '')} onClick={() => setFolder(f)}>
                <FolderIcon size={12} /> {f.split('/').pop()}
              </button>
            ))}
          </span>
        )}
        <div className="lp-list">
          {list === null ? (
            <span className="hint">Opening the library…</span>
          ) : shown.length === 0 ? (
            <span className="hint lp-none">{list.length ? 'Nothing matches.' : 'No tasks in your library yet. Use “Save to the library” above any task, or make one in the library.'}</span>
          ) : (
            shown.map((t) => (
              <button key={t.id} type="button" className="lp-row" onClick={() => onPick(t)}>
                <FileIcon kind="task" size={26} label={false} />
                <span className="lp-t">
                  <b>{t.title}</b>
                  <span className="hint">
                    {t.instructions ? t.instructions.slice(0, 90) : 'No instructions'}
                    {t.uses.length ? ` · in ${t.uses.length} ${t.uses.length === 1 ? 'lesson' : 'lessons'}` : ''}
                  </span>
                </span>
                <UiIcon name="plus" size={15} />
              </button>
            ))
          )}
        </div>
        <span className="pe-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </span>
      </div>
    </div>
  );
}

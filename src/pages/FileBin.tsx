import { useState } from 'react';
import { archiveRestore, formatBytes, requestArchivePurge, type ArchiveItem } from '../lib/archive';
import { requestDocPurge, restoreSharedDoc, type SharedDoc } from '../lib/sharedDocs';
import { ask, tell } from '../lib/ask';
import { FileIcon, type FileKind } from '../components/FileIcon';

export function FileBin({ uid, docs, items, label = 'Recycle bin' }: { uid: string; docs: SharedDoc[]; items: ArchiveItem[]; label?: string }) {
  const [busy, setBusy] = useState(false);
  const rows = [
    ...docs.filter((d) => d.deletedAt && !d.purgeRequestedAt).map((d) => ({ id: d.id, name: d.title, kind: d.kind as FileKind, size: d.size || 0, at: d.deletedAt!, restore: () => restoreSharedDoc(d), purge: () => requestDocPurge(d.id) })),
    ...items.filter((i) => i.deletedAt && !i.purgeRequestedAt).map((i) => ({ id: 'a:' + i.id, name: i.name, kind: i.kind as FileKind, size: i.size || 0, at: i.deletedAt!, restore: () => archiveRestore(uid, i), purge: () => requestArchivePurge(uid, i.id) })),
  ].sort((a, b) => b.at - a.at);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch (e) { void tell(e instanceof Error ? e.message : 'We couldn’t change the recycle bin. Try again.'); } finally { setBusy(false); } };
  const empty = async () => {
    if (!(await ask(`Permanently delete ${rows.length} ${rows.length === 1 ? 'file' : 'files'}? They cannot be restored.`, { ok: 'Empty recycle bin' }))) return;
    await run(async () => { for (const r of rows) await r.purge(); });
  };
  return <>
    <div className="ma-head"><div className="ma-head-text"><h1 className="page-title">{label}</h1><p className="hint">Files stay here for 30 days and still count towards storage. Restore returns a file to its original folder, with a new name if needed.</p><p className="hint small">Permanent deletion is processed by the scheduled cleanup, usually within 15 minutes. Storage is freed when that completes.</p></div><button className="btn danger" disabled={busy || !rows.length} onClick={() => void empty()}>Empty recycle bin</button></div>
    {!rows.length ? <div className="ma-empty"><strong>Your recycle bin is empty</strong></div> : <ul className="file-bin-list">{rows.map((r) => <li key={r.id}><FileIcon kind={r.kind} size={28} label={false} /><span className="file-bin-title"><b>{r.name}</b><span className="hint">{formatBytes(r.size)} · {Math.max(0, 30 - Math.floor((Date.now() - r.at) / 864e5))} days left</span></span><button className="btn small-btn" disabled={busy} onClick={() => void run(r.restore)}>Restore</button><button className="btn small-btn danger" disabled={busy} aria-label={`Permanently delete ${r.name}`} onClick={() => void ask(`Permanently delete “${r.name}”? This cannot be undone.`, { ok: 'Delete permanently' }).then((ok) => { if (ok) return run(r.purge); })}>Delete permanently</button></li>)}</ul>}
  </>;
}

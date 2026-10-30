import { useEffect, useRef, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/react';
import { onValue, push, set, serverTimestamp, query, limitToLast } from 'firebase/database';
import { yUndoPluginKey } from 'y-prosemirror';
import { collabRef } from './provider';
import { ask } from '../lib/ask';
import type { Layout } from './documentLayout';

type Version = { id: string; name: string; by: string; author: string; at: number; content: string; layout: string };
const preview = (node: JSONContent): string => node.type === 'text' ? node.text ?? '' : (node.content ?? []).map(preview).join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n');

export function useDocumentHistory(editor: Editor | null, docKey: string, uid: string, author: string, layout: Layout, setLayout: (p: Partial<Layout>) => void, enabled: boolean, canEdit: boolean, synced: boolean) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = useRef(false);
  const live = useRef({ layout, canEdit, synced });
  live.current = { layout, canEdit, synced };
  useEffect(() => {
    if (!enabled) return;
    return onValue(query(collabRef(docKey, 'versions'), limitToLast(50)), (snap) => {
      const all = (snap.val() ?? {}) as Record<string, Omit<Version, 'id'>>;
      setVersions(Object.entries(all).map(([id, v]) => ({ ...v, id })).sort((a, b) => b.at - a.at).slice(0, 50));
    }, () => setError('Version history could not be loaded.'));
  }, [docKey, enabled]);
  const save = async (label: string) => {
    if (!editor || !live.current.canEdit || !live.current.synced) throw new Error('Wait for the document to finish opening.');
    const content = JSON.stringify(editor.getJSON());
    if (content.length > 500_000) throw new Error('This document is too large for a history snapshot. Download a copy before restoring.');
    await set(push(collabRef(docKey, 'versions')), { name: label.slice(0, 100) || 'Saved version', by: uid, author, at: serverTimestamp(), content, layout: JSON.stringify(live.current.layout) });
    dirty.current = JSON.stringify(editor.getJSON()) !== content;
  };
  useEffect(() => { dirty.current = true; }, [layout]);
  useEffect(() => {
    if (!editor || !enabled) return;
    const update = () => { dirty.current = true; };
    editor.on('update', update);
    const timer = window.setInterval(() => {
      if (dirty.current && live.current.canEdit && live.current.synced) void save('Automatic version').catch(() => {});
    }, 5 * 60_000);
    return () => { editor.off('update', update); window.clearInterval(timer); };
  }, [editor, enabled, docKey]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'The version could not be saved.'); } finally { setBusy(false); }
  };
  const restore = (v: Version) => run(async () => {
    if (!editor || !canEdit) return;
    const content = JSON.parse(v.content) as JSONContent;
    editor.schema.nodeFromJSON(content).check();
    if (!(await ask(`Restore “${v.name}”? The current document will first be saved as a recovery version. This changes the shared document for everyone.`))) return;
    await save('Before restoring ' + v.name);
    const undo = yUndoPluginKey.getState(editor.state)?.undoManager;
    undo?.stopCapturing();
    editor.commands.setContent(content);
    setLayout(JSON.parse(v.layout) as Layout);
    undo?.stopCapturing();
  });
  return {
    open: () => setOpen(true),
    panel: open && <section className="document-find document-history" role="dialog" aria-label="Version history" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <div className="document-find-heading"><strong>Version history</strong><button type="button" aria-label="Close version history" onClick={() => setOpen(false)}>×</button></div>
      <p className="hint">Changed documents get an automatic version every five minutes while open. The latest 50 versions are listed.</p>
      {canEdit && <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await save(name || 'Named version'); setName(''); }); }}><label>Version name<input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label><button type="submit" disabled={busy || !synced}>Save version</button></form>}
      {error && <p role="alert">{error}</p>}
      {!versions.length && <p>No versions saved yet.</p>}
      <ol className="document-version-list">{versions.map((v) => <li key={v.id}><strong>{v.name}</strong><small>{new Date(v.at).toLocaleString()} · {v.author}</small><details><summary>Preview text</summary><pre>{(() => { try { return preview(JSON.parse(v.content)); } catch { return 'Preview unavailable'; } })()}</pre></details>{canEdit && <button type="button" disabled={busy} onClick={() => void restore(v)}>Restore this version</button>}</li>)}</ol>
    </section>,
  };
}

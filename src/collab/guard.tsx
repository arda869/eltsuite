import { useEffect, useState } from 'react';
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ySyncPluginKey } from 'y-prosemirror';
import type { Awareness } from 'y-protocols/awareness';
import type { Node as PMNode } from '@tiptap/pm/model';

// A document can be open in an older copy of ELT Suite (a tab left open from before an update,
// or the app on another device). That copy does not know the newer elements, such as diagrams,
// and removes them for everyone. Each copy says which version it is; when an older one is
// here, we say so, and keep what it removed so it can be put back.

declare const __BUILD__: string;
export const BUILD = Number(__BUILD__) || 0;
// Elements older copies of the app may not know.
const NEWER = new Set(['diagram']);

export type Removed = { node: unknown; pos: number; at: number };
const key = new PluginKey<Removed[]>('newer-guard');

const count = (doc: PMNode) => {
  const out: { node: PMNode; pos: number }[] = [];
  doc.descendants((n, pos) => {
    if (NEWER.has(n.type.name)) out.push({ node: n, pos });
    return !NEWER.has(n.type.name);
  });
  return out;
};

export const NewerGuard = Extension.create({
  name: 'newerGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin<Removed[]>({
        key,
        state: {
          init: () => [],
          apply(tr, list, old) {
            if (tr.getMeta(key) === 'clear') return [];
            if (!tr.docChanged || !tr.getMeta(ySyncPluginKey)) return list;
            // A change from someone else that took newer elements away: keep a copy.
            const before = count(old.doc);
            if (!before.length) return list;
            const after = count(tr.doc).length;
            if (after >= before.length) return list;
            const still = new Set<PMNode>();
            tr.doc.descendants((n) => (NEWER.has(n.type.name) && still.add(n), true));
            const gone = before.filter((b) => ![...still].some((s) => s.eq(b.node)));
            return [...list, ...gone.map((g) => ({ node: g.node.toJSON(), pos: tr.mapping.map(g.pos, -1), at: Date.now() }))].slice(-10);
          },
        },
      }),
    ];
  },
});

export const removedOf = (editor: Editor | null): Removed[] => (editor ? key.getState(editor.state) ?? [] : []);
export function putBack(editor: Editor) {
  const list = removedOf(editor);
  if (!list.length) return;
  let tr = editor.state.tr;
  for (const r of [...list].sort((a, b) => b.pos - a.pos)) {
    try {
      const n = editor.schema.nodeFromJSON(r.node as Record<string, unknown>);
      tr = tr.insert(Math.min(r.pos, tr.doc.content.size), n);
    } catch {
      /* the place is gone: at the end instead */
    }
  }
  editor.view.dispatch(tr.setMeta(key, 'clear').setMeta('collab-ok', true));
}

// Copies of the app here that are older than this one.
export function useOlderCopies(aw: Awareness | null | undefined) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!aw) return;
    const f = () => {
      let k = 0;
      aw.getStates().forEach((s, id) => {
        const u = (s as { user?: { build?: number } }).user;
        if (id !== aw.clientID && u && !(Number(u.build) >= BUILD)) k++;
      });
      setN(k);
    };
    aw.on('change', f);
    f();
    return () => aw.off('change', f);
  }, [aw]);
  return n;
}

export function OlderCopyBanner({ editor, aw }: { editor: Editor | null; aw: Awareness | null | undefined }) {
  const older = useOlderCopies(aw);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const f = () => tick((x) => x + 1);
    editor.on('transaction', f);
    return () => void editor.off('transaction', f);
  }, [editor]);
  const removed = removedOf(editor);
  if (!older && !removed.length) return null;
  return (
    <div className="older-banner" role="status">
      <span>
        {older ? (
          <>
            <b>This document is also open in an older version of ELT Suite</b>, in another tab or on another device. Reload that tab, or it may remove diagrams and other new elements.
          </>
        ) : (
          <>
            <b>An older version of ELT Suite removed {removed.length === 1 ? 'a diagram' : `${removed.length} diagrams`}</b> from this document.
          </>
        )}
      </span>
      {removed.length > 0 && editor && (
        <button type="button" className="btn small-btn primary" onClick={() => putBack(editor)} disabled={older > 0} data-tip={older ? 'Reload or close the older tab first' : undefined}>
          Put {removed.length === 1 ? 'it' : 'them'} back
        </button>
      )}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { Selection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { inField } from '../lib/keys';

// The editor shortcuts every rich editor shares (lessons, shared documents, PD notes, messages):
// Mod+K links the selected words, Alt+↑/↓ moves the paragraph or box the cursor is in.
// Keys typed in a question's own fields (an answer box, a title) are left alone.
export function useEditorKeys(editor: Editor | null, onLink?: () => boolean, move = true) {
  const link = useRef(onLink);
  link.current = onLink;
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || inField(e)) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        if (link.current?.()) e.preventDefault();
        return;
      }
      if (move && e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (!editor.isEditable) return;
        const { state } = editor;
        const index = state.selection.$from.index(0);
        const doc = state.doc;
        const j = e.key === 'ArrowUp' ? index - 1 : index + 1;
        if (j < 0 || j >= doc.childCount) return;
        e.preventDefault();
        const a = doc.child(Math.min(index, j));
        const b = doc.child(Math.max(index, j));
        let pos = 0;
        for (let k = 0; k < Math.min(index, j); k++) pos += doc.child(k).nodeSize;
        const tr = state.tr.replaceWith(pos, pos + a.nodeSize + b.nodeSize, [b, a]);
        const offset = state.selection.from - (pos + (index < j ? 0 : a.nodeSize));
        const newStart = index < j ? pos + b.nodeSize : pos;
        try {
          tr.setSelection(Selection.near(tr.doc.resolve(Math.max(0, Math.min(tr.doc.content.size, newStart + offset)))));
        } catch {
          /* keep the cursor where it lands */
        }
        editor.view.dispatch(tr.scrollIntoView());
      }
    };
    dom.addEventListener('keydown', key);
    return () => dom.removeEventListener('keydown', key);
  }, [editor, move]);
}

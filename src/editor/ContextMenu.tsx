import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Swatches } from './Highlight';

// Right-click menu in the task editor. Right-clicking a word selects it first.

type Item = { label: string; hint?: string; run: () => void; show?: boolean; danger?: boolean } | 'sep';

function selectWordAt(editor: Editor, pos: number) {
  const $p = editor.state.doc.resolve(pos);
  const parent = $p.parent;
  if (!parent.isTextblock) return false;
  const text = parent.textBetween(0, parent.content.size, '\u0000', '\u0000');
  const off = $p.parentOffset;
  const isW = (c: string) => /[\p{L}\p{N}'’-]/u.test(c);
  let a = off;
  // Clicked just after a word (e.g. on its full stop): use that word.
  while (a > 0 && !isW(text[a] ?? '') && isW(text[a - 1]) === false && off - a < 2) a--;
  let b = a;
  a = b;
  while (a > 0 && isW(text[a - 1])) a--;
  while (b < text.length && isW(text[b])) b++;
  if (a === b) return false;
  const start = $p.start();
  editor.chain().setTextSelection({ from: start + a, to: start + b }).run();
  return true;
}

export function EditorContextMenu({
  editor,
  host,
  onDefinition,
  onLink,
  actions,
}: {
  editor: Editor;
  host: HTMLElement | null;
  onDefinition: () => void;
  onLink: () => void;
  actions: { gap: (t: string) => void; drop: (t: string) => void; choice: (t: string) => void; stress: (t: string) => void; ipa: () => void };
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host) return;
    const open = (e: MouseEvent) => {
      const pm = (e.target as HTMLElement).closest('.ProseMirror');
      if (!pm || (e.target as HTMLElement).closest('input, textarea, [contenteditable="false"]')) return;
      e.preventDefault();
      const hit = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      const { from, to, empty } = editor.state.selection;
      const h = host.getBoundingClientRect();
      const x = Math.min(e.clientX - h.left, h.width - 250);
      const y = e.clientY - h.top;
      // Wait for the browser to finish its own click handling, which can move the cursor.
      window.setTimeout(() => {
        if (hit && (empty || hit.pos < from || hit.pos > to)) {
          if (!selectWordAt(editor, hit.pos)) editor.chain().setTextSelection(hit.pos).run();
        } else if (!empty) editor.chain().setTextSelection({ from, to }).run();
        editor.view.focus();
        setAt({ x, y });
      }, 0);
    };
    host.addEventListener('contextmenu', open);
    return () => host.removeEventListener('contextmenu', open);
  }, [host, editor]);

  useEffect(() => {
    if (!at) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAt(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setAt(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [at]);

  if (!at) return null;
  const { from, to, empty } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, ' ').trim();
  const has = !empty && !!text;
  const short = text.length > 22 ? text.slice(0, 20) + '…' : text;
  const run = (f: () => void) => () => {
    setAt(null);
    f();
  };
  const items: Item[] = [
    { label: editor.isActive('definition') ? 'Edit definition' : 'Add a definition', hint: short, run: run(onDefinition), show: has || editor.isActive('definition') },
    { label: editor.isActive('lessonLink') ? 'Change link' : 'Link to another task', run: run(onLink), show: has || editor.isActive('lessonLink') },
    { label: 'Add IPA after this', run: run(() => (editor.chain().focus().setTextSelection(to).run(), actions.ipa())), show: has },
    { label: 'Mark word stress', run: run(() => actions.stress(text)), show: has && !/\s/.test(text) },
    'sep',
    { label: 'Make it a gap', hint: 'answer: ' + short, run: run(() => actions.gap(text)), show: has },
    { label: 'Make it a drag-and-drop gap', run: run(() => actions.drop(text)), show: has },
    { label: 'Make it multiple choice', run: run(() => actions.choice(text)), show: has },
    'sep',
    { label: 'Bold', run: run(() => editor.chain().focus().toggleBold().run()), show: has },
    { label: 'Italic', run: run(() => editor.chain().focus().toggleItalic().run()), show: has },
    { label: 'Underline', run: run(() => editor.chain().focus().toggleUnderline().run()), show: has },
    { label: 'Copy', run: run(() => navigator.clipboard?.writeText(text).catch(() => {})), show: has },
    'sep',
    { label: 'Remove definition', run: run(() => editor.chain().focus().extendMarkRange('definition').unsetMark('definition').run()), show: editor.isActive('definition'), danger: true },
    { label: 'Remove link', run: run(() => editor.chain().focus().extendMarkRange('lessonLink').unsetMark('lessonLink').run()), show: editor.isActive('lessonLink'), danger: true },
  ];
  // Drop separators that end up at the start, the end, or next to each other.
  const visible = items.filter((i) => i === 'sep' || i.show !== false);
  const clean = visible.filter((i, k) => i !== 'sep' || (k > 0 && k < visible.length - 1 && visible[k - 1] !== 'sep'));
  if (!clean.some((i) => i !== 'sep')) {
    return (
      <div ref={ref} className="ctx-menu" style={{ left: at.x, top: at.y }} role="menu">
        <span className="ctx-empty">Select a word or phrase to see options. Type / to add questions.</span>
      </div>
    );
  }
  return (
    <div ref={ref} className="ctx-menu" style={{ left: at.x, top: at.y }} role="menu" onMouseDown={(e) => e.preventDefault()}>
      {has && (
        <span className="ctx-hl">
          <span className="ctx-hl-label">Highlight</span>
          <Swatches editor={editor} onDone={() => setAt(null)} />
        </span>
      )}
      {clean.map((i, k) =>
        i === 'sep' ? (
          <span key={k} className="ctx-sep" />
        ) : (
          <button key={k} type="button" role="menuitem" className={'ctx-item' + (i.danger ? ' danger' : '')} onClick={i.run}>
            <span>{i.label}</span>
            {i.hint && <span className="ctx-hint">{i.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}

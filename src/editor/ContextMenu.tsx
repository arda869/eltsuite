import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Swatches } from './Highlight';
import { ColorSwatches } from './TextColor';

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
      const target = e.target as HTMLElement;
      const pm = target.closest('.ProseMirror');
      if (!pm || target.closest('input, textarea, select, .gap-pop, .def-pop, .pick-settings, .r-item, .r-add')) return;
      e.preventDefault();
      // Right-click on a question or other object: select the whole object.
      const obj = target.closest('[data-node-view-wrapper]') as HTMLElement | null;
      const inText = target.closest('[data-node-view-content]');
      if (obj && pm.contains(obj) && !(inText && obj.contains(inText))) {
        const x0 = Math.min(e.clientX, window.innerWidth - 260);
        const y0 = Math.min(e.clientY, window.innerHeight - 220);
        window.setTimeout(() => {
          try {
            const pos = editor.view.posAtDOM(obj, 0);
            const $pos = editor.state.doc.resolve(pos);
            const nodePos = editor.state.doc.nodeAt(pos) ? pos : $pos.before();
            editor.chain().setNodeSelection(nodePos).run();
          } catch {
            /* fall back to the cursor */
          }
          editor.view.focus();
          setAt({ x: x0, y: y0 });
        }, 0);
        return;
      }
      const hit = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      const { from, to, empty } = editor.state.selection;
      const x = Math.min(e.clientX, window.innerWidth - 260);
      const y = Math.max(8, Math.min(e.clientY, window.innerHeight - 560));
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
  const sel = editor.state.selection as typeof editor.state.selection & { node?: { type: { name: string } } };
  const isObject = !!sel.node;
  const { from, to, empty } = editor.state.selection;
  const copy = () => {
    editor.view.focus();
    document.execCommand('copy');
  };
  const cut = () => {
    editor.view.focus();
    document.execCommand('cut');
  };
  const paste = async () => {
    editor.view.focus();
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        if (it.types.includes('text/html')) {
          const html = await (await it.getType('text/html')).text();
          (editor.view as unknown as { pasteHTML: (h: string) => void }).pasteHTML(html);
          return;
        }
      }
      const text = await navigator.clipboard.readText();
      (editor.view as unknown as { pasteText: (t: string) => void }).pasteText(text);
    } catch {
      window.alert('Your browser blocked pasting from this menu. Press Ctrl+V (or ⌘V on a Mac) to paste.');
    }
  };
  const text = editor.state.doc.textBetween(from, to, ' ').trim();
  const has = !empty && !!text && !isObject;
  const anything = !empty;
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
    { label: 'Strikethrough', run: run(() => editor.chain().focus().toggleStrike().run()), show: has },
    'sep',
    { label: 'Cut', hint: '⌘X', run: run(cut), show: anything },
    { label: 'Copy', hint: '⌘C', run: run(copy), show: anything },
    { label: 'Paste', hint: '⌘V', run: run(paste) },
    { label: isObject ? 'Delete' : 'Delete', run: run(() => editor.chain().focus().deleteSelection().run()), show: anything, danger: isObject },
    'sep',
    { label: 'Remove definition', run: run(() => editor.chain().focus().extendMarkRange('definition').unsetMark('definition').run()), show: editor.isActive('definition'), danger: true },
    { label: 'Remove link', run: run(() => editor.chain().focus().extendMarkRange('lessonLink').unsetMark('lessonLink').run()), show: editor.isActive('lessonLink'), danger: true },
  ];
  // Drop separators that end up at the start, the end, or next to each other.
  const visible = items.filter((i) => i === 'sep' || i.show !== false);
  const clean = visible.filter((i, k) => i !== 'sep' || (k > 0 && k < visible.length - 1 && visible[k - 1] !== 'sep'));
  if (!clean.some((i) => i !== 'sep')) {
    return (
      <div ref={ref} className="ctx-menu" style={{ position: 'fixed', left: at.x, top: at.y, maxHeight: 'calc(100vh - 16px)', overflow: 'auto' }} role="menu">
        <span className="ctx-empty">Select a word or phrase to see options. Type / to add questions.</span>
      </div>
    );
  }
  return (
    <div ref={ref} className="ctx-menu" style={{ position: 'fixed', left: at.x, top: at.y, maxHeight: 'calc(100vh - 16px)', overflow: 'auto' }} role="menu" onMouseDown={(e) => e.preventDefault()}>
      {has && (
        <span className="ctx-hl">
          <span className="ctx-hl-label">Highlight</span>
          <Swatches editor={editor} onDone={() => setAt(null)} />
        </span>
      )}
      {has && (
        <span className="ctx-hl">
          <span className="ctx-hl-label">Colour</span>
          <ColorSwatches editor={editor} onDone={() => setAt(null)} />
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

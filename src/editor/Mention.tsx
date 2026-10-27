import { mergeAttributes, Node } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { composing } from '../lib/keys';

// @tags for the teacher or a learner. The tagged person sees their tag highlighted.
export const TEACHER_TAG = 'teacher';

export const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    id: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-id') || '', renderHTML: (a: { id: string }) => ({ 'data-id': a.id }) },
    label: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-label') || '', renderHTML: (a: { label: string }) => ({ 'data-label': a.label }) },
  }),
  parseHTML: () => [{ tag: 'span[data-mention]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-mention': '', class: 'mention' }), '@' + node.attrs.label],
  renderText: ({ node }) => '@' + node.attrs.label,
});

export function MentionTag({ label, me }: { label: string; me?: boolean }) {
  return <span className={'mention' + (me ? ' me' : '')}>@{label}</span>;
}

// Suggestion list while typing @ in the editor.
export function useMentionMenu(editor: Editor | null, people: { id: string; name: string }[], teacherTag = true) {
  const [state, setState] = useState<{ from: number; query: string; top: number; left: number } | null>(null);
  const [index, setIndex] = useState(0);
  // Closed with Escape: it stays closed for this @ until a new one is typed.
  const dismissed = useRef(-1);
  useEffect(() => {
    if (!editor) return;
    const check = () => {
      const { $from, empty } = editor.state.selection;
      if (!empty || !$from.parent.isTextblock) return setState(null);
      const before = $from.parent.textBetween(0, $from.parentOffset, '\u0000', '\u0000');
      const m = /(?:^|[\s(])@([\p{L}' ]{0,24})$/u.exec(before);
      if (!m || m[1].includes('  ')) return (dismissed.current = -1), setState(null);
      const from = $from.pos - m[1].length - 1;
      if (dismissed.current === from) return setState(null);
      const c = editor.view.coordsAtPos($from.pos);
      setState({ from, query: m[1], top: c.bottom + 6, left: c.left });
      setIndex(0);
    };
    editor.on('selectionUpdate', check);
    editor.on('update', check);
    return () => {
      editor.off('selectionUpdate', check);
      editor.off('update', check);
    };
  }, [editor]);
  // In a lesson, @Teacher reaches the class teacher; in a chat everyone is named.
  const all = teacherTag ? [{ id: TEACHER_TAG, name: 'Teacher' }, ...people] : people;
  const q = state?.query.trim().toLowerCase() ?? '';
  const items = state ? all.filter((p) => p.name.toLowerCase().split(' ').some((w) => w.startsWith(q)) || p.name.toLowerCase().startsWith(q)).slice(0, 8) : [];
  const choose = (p: { id: string; name: string }) => {
    if (!editor || !state) return;
    const to = editor.state.selection.from;
    editor.chain().focus().insertContentAt({ from: state.from, to }, [{ type: 'mention', attrs: { id: p.id, label: p.id === TEACHER_TAG ? 'Teacher' : p.name.split(' ')[0] } }, { type: 'text', text: ' ' }]).run();
    setState(null);
  };
  useEffect(() => {
    if (!state || !items.length) return;
    const key = (e: KeyboardEvent) => {
      // Only keys typed in this editor, and never half-way through a word typed with an IME.
      if (composing(e) || !editor?.view.dom.contains(e.target as globalThis.Node)) return;
      if (e.key === 'ArrowDown') setIndex((i) => (i + 1) % items.length);
      else if (e.key === 'ArrowUp') setIndex((i) => (i - 1 + items.length) % items.length);
      else if (e.key === 'Enter' || e.key === 'Tab') choose(items[index]);
      else if (e.key === 'Escape') (dismissed.current = state.from), setState(null);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    if (state && items.length) dom.setAttribute('aria-activedescendant', 'mention-o-' + index);
    else if (dom.getAttribute('aria-activedescendant')?.startsWith('mention-')) dom.removeAttribute('aria-activedescendant');
  });
  return { state, items, index, choose, setIndex };
}

export function MentionMenu({ menu }: { menu: ReturnType<typeof useMentionMenu> }) {
  const mouse = useRef(false);
  if (!menu.state || !menu.items.length) return null;
  // Below the @, or above it when there is no room below.
  const h = 34 + menu.items.length * 36;
  const top = menu.state.top + h > window.innerHeight - 8 ? Math.max(8, menu.state.top - h - 30) : menu.state.top;
  return (
    <div className="mention-menu" id="mention-list" style={{ position: 'fixed', top, left: Math.max(8, Math.min(menu.state.left, window.innerWidth - 238)) }} role="listbox" aria-label="Tag someone" onMouseMove={() => (mouse.current = true)}>
      <span className="slash-group" aria-hidden="true">Tag someone</span>
      {menu.items.map((p, i) => (
        <div
          key={p.id}
          id={'mention-o-' + i}
          role="option"
          aria-selected={i === menu.index}
          className={'mention-item' + (i === menu.index ? ' on' : '')}
          onMouseDown={(e) => {
            e.preventDefault();
            menu.choose(p);
          }}
          onMouseMove={() => mouse.current && i !== menu.index && menu.setIndex(i)}
        >
          <span className="rf-av" aria-hidden="true">{p.id === TEACHER_TAG ? 'T' : p.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
          {p.name}
        </div>
      ))}
    </div>
  );
}

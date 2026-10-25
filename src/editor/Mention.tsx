import { mergeAttributes, Node } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';

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
export function useMentionMenu(editor: Editor | null, people: { id: string; name: string }[]) {
  const [state, setState] = useState<{ from: number; query: string; top: number; left: number } | null>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const check = () => {
      const { $from, empty } = editor.state.selection;
      if (!empty || !$from.parent.isTextblock) return setState(null);
      const before = $from.parent.textBetween(0, $from.parentOffset, '\u0000', '\u0000');
      const m = /(?:^|[\s(])@([\p{L}' ]{0,24})$/u.exec(before);
      if (!m || m[1].includes('  ')) return setState(null);
      const from = $from.pos - m[1].length - 1;
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
  const all = [{ id: TEACHER_TAG, name: 'Teacher' }, ...people];
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
      if (e.key === 'ArrowDown') setIndex((i) => (i + 1) % items.length);
      else if (e.key === 'ArrowUp') setIndex((i) => (i - 1 + items.length) % items.length);
      else if (e.key === 'Enter' || e.key === 'Tab') choose(items[index]);
      else if (e.key === 'Escape') setState(null);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  return { state, items, index, choose, setIndex };
}

export function MentionMenu({ menu }: { menu: ReturnType<typeof useMentionMenu> }) {
  if (!menu.state || !menu.items.length) return null;
  return (
    <div className="mention-menu" style={{ position: 'fixed', top: menu.state.top, left: Math.min(menu.state.left, window.innerWidth - 230) }} role="listbox">
      <span className="slash-group">Tag someone</span>
      {menu.items.map((p, i) => (
        <div
          key={p.id}
          role="option"
          aria-selected={i === menu.index}
          className={'mention-item' + (i === menu.index ? ' on' : '')}
          onMouseDown={(e) => {
            e.preventDefault();
            menu.choose(p);
          }}
          onMouseEnter={() => menu.setIndex(i)}
        >
          <span className="rf-av">{p.id === TEACHER_TAG ? 'T' : p.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
          {p.name}
        </div>
      ))}
    </div>
  );
}

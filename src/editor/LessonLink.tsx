import { Mark, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// A link inside the text that takes learners to another place in the lesson.
// "kind" leaves room for notebook pages and other places later.

export type LinkTarget = { kind: 'task'; taskId: string };
export type LinkPlace = { id: string; title: string; n: number };

export const LessonLink = Mark.create({
  name: 'lessonLink',
  inclusive: false,
  addAttributes: () => ({
    kind: { default: 'task', parseHTML: (el: HTMLElement) => el.getAttribute('data-kind') || 'task', renderHTML: (a: { kind: string }) => ({ 'data-kind': a.kind }) },
    taskId: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-task') || '', renderHTML: (a: { taskId: string }) => ({ 'data-task': a.taskId }) },
  }),
  parseHTML: () => [{ tag: 'span[data-lesson-link]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-lesson-link': '', class: 'lesson-link' }), 0],
});

export const LINK_ICON = (
  <svg className="ll-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function LinkPop({ editor, open, onClose, places }: { editor: Editor; open: boolean; onClose: () => void; places: LinkPlace[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [q, setQ] = useState('');
  const current = editor.getAttributes('lessonLink').taskId as string | undefined;
  const existing = editor.isActive('lessonLink');

  useEffect(() => {
    if (open && existing) editor.chain().extendMarkRange('lessonLink').run();
    setQ('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const c = editor.view.coordsAtPos(editor.state.selection.from);
    const room = window.innerHeight - c.bottom - 16;
    setPos({ top: room > 300 ? c.bottom + 8 : Math.max(8, c.top - 8 - Math.min(560, window.innerHeight * 0.7)), left: Math.max(8, Math.min(c.left - 20, window.innerWidth - 320 - 8)) });
  }, [open, editor]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  });

  if (!open) return null;
  const choose = (taskId: string) => {
    editor.chain().focus().extendMarkRange('lessonLink').setMark('lessonLink', { kind: 'task', taskId }).run();
    onClose();
  };
  const list = places.filter((p) => (p.title || '').toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div ref={ref} className="def-pop link-pop" style={{ position: 'fixed', top: pos.top, left: pos.left }} role="dialog" aria-label="Link">
      <span className="pop-type">Link to</span>
      <div className="seg small-seg" role="tablist" aria-label="Link to">
        <button type="button" role="tab" aria-selected className="on">
          A task in this lesson
        </button>
        <button type="button" role="tab" aria-selected={false} disabled title="Coming soon">
          Notebook
        </button>
      </div>
      {places.length > 6 && <input className="link-search" autoFocus value={q} placeholder="Find a task" onChange={(e) => setQ(e.target.value)} />}
      <div className="link-list">
        {list.length === 0 && <span className="hint">No other tasks in this lesson yet.</span>}
        {list.map((p) => (
          <button key={p.id} type="button" className={'link-item' + (current === p.id ? ' on' : '')} onClick={() => choose(p.id)}>
            <span className="n">{p.n}</span>
            <span>{p.title || 'Untitled task'}</span>
          </button>
        ))}
      </div>
      {existing && (
        <button
          type="button"
          className="btn link small"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            editor.chain().focus().extendMarkRange('lessonLink').unsetMark('lessonLink').run();
            onClose();
          }}
        >
          Remove link
        </button>
      )}
    </div>
  );
}

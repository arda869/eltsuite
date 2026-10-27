import { Mark, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useBankPages } from '../lib/notebookPages';
import { useEditorClass } from './context';

// A link inside the text that takes learners to another place in the lesson.
// "kind" leaves room for notebook pages and other places later.

export type LinkTarget = { kind: 'task'; taskId: string } | { kind: 'notebook'; entryId: string };
export type LinkPlace = { id: string; title: string; n: number };

export const LessonLink = Mark.create({
  name: 'lessonLink',
  inclusive: false,
  addAttributes: () => ({
    kind: { default: 'task', parseHTML: (el: HTMLElement) => el.getAttribute('data-kind') || 'task', renderHTML: (a: { kind: string }) => ({ 'data-kind': a.kind }) },
    taskId: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-task') || '', renderHTML: (a: { taskId: string }) => ({ 'data-task': a.taskId }) },
    entryId: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-entry') || '', renderHTML: (a: { entryId: string }) => ({ 'data-entry': a.entryId }) },
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
  const [tab, setTab] = useState<'task' | 'web' | 'notebook'>('task');
  const { classId } = useEditorClass();
  const pages = useBankPages(classId, open);
  const [url, setUrl] = useState('');
  const current = editor.getAttributes('lessonLink').taskId as string | undefined;
  const existing = editor.isActive('lessonLink');

  useEffect(() => {
    if (open && existing) editor.chain().extendMarkRange('lessonLink').run();
    const web = editor.getAttributes('link').href as string | undefined;
    if (open && web) editor.chain().extendMarkRange('link').run();
    setUrl(web ?? '');
    setTab(web ? 'web' : editor.getAttributes('lessonLink').kind === 'notebook' ? 'notebook' : 'task');
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
    // Escape closes this panel only, and the cursor goes back to the text.
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), onClose(), editor.commands.focus());
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key, true);
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
        <button type="button" role="tab" aria-selected={tab === 'task'} className={tab === 'task' ? 'on' : ''} onClick={() => setTab('task')}>
          A task in this lesson
        </button>
        <button type="button" role="tab" aria-selected={tab === 'web'} className={tab === 'web' ? 'on' : ''} onClick={() => setTab('web')}>
          A web page
        </button>
        <button type="button" role="tab" aria-selected={tab === 'notebook'} className={tab === 'notebook' ? 'on' : ''} onClick={() => setTab('notebook')}>
          Notebook
        </button>
      </div>
      {tab === 'web' && (
        <form
          className="link-web"
          onSubmit={(e) => {
            e.preventDefault();
            const u = url.trim();
            if (!/^https:\/\//i.test(u)) return;
            editor.chain().focus().extendMarkRange('lessonLink').unsetMark('lessonLink').setLink({ href: u }).run();
            onClose();
          }}
        >
          <input autoFocus className="link-search" value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
          {url.trim() && !/^https:\/\//i.test(url.trim()) && <span className="error">The link must start with https://</span>}
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn small-btn primary" disabled={!/^https:\/\//i.test(url.trim())}>
              Add link
            </button>
            {editor.isActive('link') && (
              <button type="button" className="btn link small" onClick={() => (editor.chain().focus().extendMarkRange('link').unsetLink().run(), onClose())}>
                Remove web link
              </button>
            )}
          </span>
        </form>
      )}
      {tab === 'task' && places.length > 6 && <input className="link-search" autoFocus value={q} placeholder="Find a task" onChange={(e) => setQ(e.target.value)} />}
      {tab === 'task' && <div className="link-list">
        {list.length === 0 && <span className="hint">No other tasks in this lesson yet.</span>}
        {list.map((p) => (
          <button key={p.id} type="button" className={'link-item' + (current === p.id ? ' on' : '')} onClick={() => choose(p.id)}>
            <span className="n">{p.n}</span>
            <span>{p.title || 'Untitled task'}</span>
          </button>
        ))}
      </div>}
      {tab === 'notebook' && (
        <div className="link-list">
          {pages.length === 0 && <span className="hint">No grammar or vocabulary pages yet. Add them in the class Notebook.</span>}
          {pages.map((p) => (
            <button key={p.id} type="button" className={'link-item' + (editor.getAttributes('lessonLink').entryId === p.id ? ' on' : '')} onClick={() => (editor.chain().focus().extendMarkRange('lessonLink').setMark('lessonLink', { kind: 'notebook', entryId: p.id, taskId: '' }).run(), onClose())}>
              <span className="n">{p.bank === 'vocab' ? 'V' : 'G'}</span>
              <span>{p.title}</span>
            </button>
          ))}
        </div>
      )}
      {tab === 'task' && existing && (
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

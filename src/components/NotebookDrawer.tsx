import { useEffect, useState, type RefObject } from 'react';
import type { ClassDoc, Item, Topic } from '../lib/classes';
import { canLearnerAdd } from '../lib/notebook';
import { Notebook, type Me, type Prefill } from './Notebook';
import { speak } from '../lib/media';

// The notebook as a side drawer during a lesson, for the teacher and for learners.
export function NotebookDrawer({ open, onClose, classId, c, me, items, topics, roster, prefill, onPrefillDone, focus, context }: { open: boolean; onClose: () => void; classId: string; c: ClassDoc | null | undefined; me: Me; items: Item[]; topics: Topic[]; roster?: { id: string; name: string }[]; prefill?: Prefill | null; onPrefillDone?: () => void; focus?: string | null; context?: { itemId?: string | null; taskId?: string | null } }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="nb-drawer-scrim" onClick={onClose}>
      <aside className="nb-drawer" role="dialog" aria-label="Notebook" onClick={(e) => e.stopPropagation()}>
        <div className="nb-drawer-head">
          <h2>Notebook</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <Notebook classId={classId} c={c} me={me} items={items} topics={topics} roster={roster} compact prefill={prefill} onPrefillDone={onPrefillDone} focus={focus} context={context} />
      </aside>
    </div>
  );
}

// The sentence around a selection, for the example field.
function sentenceAround(range: Range) {
  const block = (range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement)?.closest('p, li, td, th, h1, h2, h3, h4, div') as HTMLElement | null;
  const text = (block?.innerText ?? '').replace(/\s+/g, ' ').trim();
  const sel = range.toString().trim();
  if (!text || !sel) return sel;
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.find((p) => p.includes(sel)) ?? text.slice(0, 200);
}

// A small "Add to notebook" button that appears when text is selected inside a container.
export function SelectionNote({ container, c, me, onAdd, extraSkip }: { container: RefObject<HTMLElement>; c: ClassDoc | null | undefined; me: Me; onAdd: (p: Prefill) => void; extraSkip?: string }) {
  const [sel, setSel] = useState<{ word: string; sentence: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const up = (ev: Event) =>
      !(ev.target as HTMLElement).closest?.('.sel-note') &&
      window.setTimeout(() => {
        const s = window.getSelection();
        if (!s || s.isCollapsed || !s.rangeCount) return setSel(null);
        const r = s.getRangeAt(0);
        if (!root.contains(r.commonAncestorContainer)) return setSel(null);
        const el = r.commonAncestorContainer.nodeType === 1 ? (r.commonAncestorContainer as Element) : r.commonAncestorContainer.parentElement;
        if (el?.closest('input, textarea, [contenteditable="true"], .nb, .ann-tools' + (extraSkip ? ', ' + extraSkip : ''))) return setSel(null);
        const word = r.toString().trim();
        if (!word || word.length > 600) return setSel(null);
        const rect = r.getBoundingClientRect();
        setSel({ word, sentence: sentenceAround(r), x: rect.left + rect.width / 2, y: rect.bottom });
      }, 0);
    const down = (e: MouseEvent) => !(e.target as HTMLElement).closest('.sel-note') && setSel(null);
    root.addEventListener('mouseup', up);
    root.addEventListener('touchend', up);
    document.addEventListener('mousedown', down);
    return () => {
      root.removeEventListener('mouseup', up);
      root.removeEventListener('touchend', up);
      document.removeEventListener('mousedown', down);
    };
  }, [container, extraSkip]);
  if (!sel) return null;
  const toClass = me.teacher || canLearnerAdd(c, me.learnerId);
  return (
    <span className="sel-note" style={{ left: Math.max(8, Math.min(sel.x - 90, window.innerWidth - 190)), top: sel.y + 6 }} onMouseDown={(e) => e.preventDefault()}>
      <span className="sel-note-word">“{sel.word.length > 24 ? sel.word.slice(0, 22) + '…' : sel.word}”</span>
      <button type="button" className="sel-listen" title="Listen" aria-label="Read this aloud" onClick={() => speak(sel.word)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
        </svg>
      </button>
      {toClass && (
        <button type="button" onClick={() => (onAdd({ type: 'vocab', word: sel.word, example: sel.sentence }), setSel(null))}>
          {me.teacher ? 'Add to notebook' : 'Class notebook'}
        </button>
      )}
      {!me.teacher && (
        <button type="button" onClick={() => (onAdd({ type: 'vocab', word: sel.word, example: sel.sentence, mine: true }), setSel(null))}>
          My notebook
        </button>
      )}
    </span>
  );
}

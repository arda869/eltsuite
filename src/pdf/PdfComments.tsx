import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ago } from '../lib/activity';
import { fromStack, toStack } from './PdfStack';
import type { PageSize } from './pdfData';

// Comments pinned to a spot on a page. They are the file's comments (sharedDocs/{id}/comments), with
// a `spot` on a page; replies carry `parent`. So they also show in the Comments panel, and anyone
// who can comment on the file can place one, not only people who can edit it.

export type PdfComment = { id: string; by: string; name: string; text: string; at: number; done?: boolean; spot?: { page: number; x: number; y: number }; parent?: string };
export const GOTO_SPOT = 'll:pdf-goto-spot';

export function usePdfComments(fileId: string) {
  const [list, setList] = useState<PdfComment[]>([]);
  useEffect(() => onSnapshot(query(collection(db, 'sharedDocs', fileId, 'comments'), orderBy('at', 'asc')), (s) => setList(s.docs.map((x) => ({ id: x.id, ...(x.data() as Omit<PdfComment, 'id'>) }))), () => setList([])), [fileId]);
  return list;
}

type Props = { fileId: string; pages: PageSize[]; me: { uid: string; name: string }; canWrite: boolean; canResolve: boolean; owner: boolean; placing: boolean; onPlaced: () => void; showDone: boolean };

export function PdfCommentPins({ fileId, pages, me, canWrite, canResolve, owner, placing, onPlaced, showDone }: Props) {
  const list = usePdfComments(fileId);
  const [stack, setStack] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState<string | null>(null); // a thread, or 'new'
  const [draft, setDraft] = useState<{ page: number; x: number; y: number } | null>(null);
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  // The comment box takes the cursor when it opens (the PDF's editor would keep it otherwise).
  useEffect(() => { if (open) window.setTimeout(() => area.current?.focus(), 30); }, [open, draft]);
  useEffect(() => {
    let raf = 0;
    const find = () => { const el = document.querySelector<HTMLElement>('.pdff .pdf-stack'); if (el) setStack(el); else raf = requestAnimationFrame(find); };
    find();
    return () => cancelAnimationFrame(raf);
  }, [pages.length]);
  // From the Comments panel: open a pinned comment.
  useEffect(() => {
    const f = (e: Event) => { const id = (e as CustomEvent<string>).detail; setOpen(id); window.setTimeout(() => document.querySelector(`[data-pin="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); };
    window.addEventListener(GOTO_SPOT, f);
    return () => window.removeEventListener(GOTO_SPOT, f);
  }, []);
  if (!stack) return null;
  const pins = list.filter((c) => c.spot && !c.parent && (showDone || !c.done));
  const repliesOf = (id: string) => list.filter((c) => c.parent === id);
  const send = async (spot?: { page: number; x: number; y: number }, parent?: string) => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      const ref = await addDoc(collection(db, 'sharedDocs', fileId, 'comments'), { by: me.uid, name: me.name || 'Someone', text: t.slice(0, 2000), at: Date.now(), ...(spot ? { spot } : {}), ...(parent ? { parent } : {}) });
      if (spot) { setDraft(null); setOpen(ref.id); }
    } catch {
      setText(t);
    }
  };
  const place = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const at = fromStack(pages, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    setDraft(at);
    setOpen('new');
    setText('');
    onPlaced();
  };
  const pos = (s: { page: number; x: number; y: number }) => { const at = toStack(pages, s.page, s.x, s.y); return { left: `${at.left}%`, top: `${at.top}%` }; };
  const composer = (onSend: () => void, label: string) => (
    <span className="pcm-new">
      <textarea ref={area} rows={2} aria-label={label} placeholder={label} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } if (e.key === 'Escape') { setOpen(null); setDraft(null); } }} />
      <button type="button" className="btn small-btn primary" disabled={!text.trim()} onClick={onSend}>{label.startsWith('Reply') ? 'Reply' : 'Comment'}</button>
    </span>
  );
  // Kept apart from the PDF's editor: clicks and typing here never reach it.
  const keep = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <span className="pcm-layer" contentEditable={false} suppressContentEditableWarning onMouseDown={keep} onPointerDown={keep} onKeyDown={keep} onBeforeInput={keep} onInput={keep}>
      {placing && <div className="pcm-catch" onPointerDown={place} aria-label="Click where the comment goes" />}
      {pins.map((c, i) => {
        const replies = repliesOf(c.id);
        return (
          <span key={c.id} className={'pcm-pin' + (c.done ? ' done' : '') + (open === c.id ? ' on' : '')} style={pos(c.spot!)} data-pin={c.id}>
            <button type="button" className="pcm-dot" aria-label={`Comment ${i + 1} by ${c.name}${c.done ? ', done' : ''}`} aria-expanded={open === c.id} onClick={() => { setOpen(open === c.id ? null : c.id); setText(''); }}>{i + 1}</button>
            {open === c.id && (
              <span className="pcm-pop" role="dialog" aria-label={`Comment ${i + 1}`}>
                {[c, ...replies].map((m) => (
                  <span key={m.id} className="pcm-msg">
                    <span className="pcm-who"><b>{m.name}</b><span className="hint">{ago(m.at)}</span>{(m.by === me.uid || owner) && <button type="button" className="btn link small" onClick={() => void deleteDoc(doc(db, 'sharedDocs', fileId, 'comments', m.id))}>Delete</button>}</span>
                    <span className="pcm-text">{m.text}</span>
                  </span>
                ))}
                {canWrite && !c.done && composer(() => void send(undefined, c.id), 'Reply')}
                <span className="pcm-acts">
                  {canResolve && <button type="button" className="btn small-btn" onClick={() => void updateDoc(doc(db, 'sharedDocs', fileId, 'comments', c.id), { done: !c.done })}>{c.done ? 'Open again' : 'Mark as done'}</button>}
                  <button type="button" className="btn link small" onClick={() => setOpen(null)}>Close</button>
                </span>
              </span>
            )}
          </span>
        );
      })}
      {draft && open === 'new' && (
        <span className="pcm-pin on" style={pos(draft)}>
          <span className="pcm-dot new" aria-hidden="true">+</span>
          <span className="pcm-pop" role="dialog" aria-label="New comment">
            {composer(() => void send(draft), 'Write a comment')}
            <span className="pcm-acts"><button type="button" className="btn link small" onClick={() => { setDraft(null); setOpen(null); }}>Cancel</button></span>
          </span>
        </span>
      )}
    </span>,
    stack,
  );
}

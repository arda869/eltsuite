import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { PersonFace } from '../components/avatars';
import { UiIcon } from '../components/UiIcon';

// Comments in a Collab document, in the way people know from other editors: each thread is a card
// beside the text with the person's picture and when they wrote it. Click the highlighted words (or
// the card) to open the thread; replies, editing and deleting your own words, and Mark as done are
// all on the card. Threads marked as done stay in the Done list and can be opened again.

export type Msg = { by: string; name: string; color: string; text: string; at: number; edited?: number };
export type Thread = Msg & { quote?: string; resolved?: boolean; resolvedBy?: string; resolvedAt?: number; r?: Record<string, Msg> };

// “Just now”, “5 min ago”, “14:05”, “Yesterday 14:05”, “24 Nov”.
export function when(at: number, now = Date.now()) {
  const d = new Date(at);
  const mins = Math.round((now - at) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(d)) / 86400000);
  if (days === 0) return time;
  if (days === 1) return `Yesterday ${time}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

function Message({ m, mine, onEdit, onDelete, deleteLabel }: { m: Msg; mine: boolean; onEdit?: (text: string) => void; onDelete?: () => void; deleteLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.text);
  const [menu, setMenu] = useState(false);
  const save = () => { const t = text.trim(); if (t && t !== m.text) onEdit?.(t); setEditing(false); };
  return (
    <div className="cm-msg">
      <span className="cm-face"><PersonFace id={m.by} name={m.name} size={28} /></span>
      <div className="cm-body">
        <span className="cm-who">
          <b>{m.name}</b>
          <span className="cm-when" title={new Date(m.at).toLocaleString('en-GB')}>{when(m.at)}{m.edited ? ' · edited' : ''}</span>
          {mine && (onEdit || onDelete) && !editing && (
            <span className="cm-more" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="cm-ic" aria-label="More options" aria-expanded={menu} data-tip="More" onClick={() => setMenu((v) => !v)}>
                <UiIcon name="more" size={16} />
              </button>
              {menu && (
                <span className="cm-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                  {onEdit && <button type="button" role="menuitem" onClick={() => { setMenu(false); setText(m.text); setEditing(true); }}>Edit</button>}
                  {onDelete && <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); onDelete(); }}>{deleteLabel}</button>}
                </span>
              )}
            </span>
          )}
        </span>
        {editing ? (
          <span className="cm-edit" onClick={(e) => e.stopPropagation()}>
            <textarea autoFocus value={text} aria-label="Change your comment" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
              if (e.key === 'Escape') setEditing(false);
            }} />
            <span className="cm-btns">
              <button type="button" className="cm-btn" onClick={() => setEditing(false)}>Cancel</button>
              <button type="button" className="cm-btn primary" disabled={!text.trim()} onClick={save}>Save</button>
            </span>
          </span>
        ) : (
          <span className="cm-text">{m.text}</span>
        )}
      </div>
    </div>
  );
}

export function CommentThread({ id, t, me, active, onOpen, onReply, onResolve, onReopen, onEdit, onDelete, onHover }: {
  id: string; t: Thread; me: string; active: boolean;
  onOpen: () => void; onReply: (text: string) => void; onResolve?: () => void; onReopen?: () => void;
  onEdit: (reply: string | null, text: string) => void; onDelete: (reply: string | null) => void; onHover?: (on: boolean) => void;
}) {
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const replies = Object.entries(t.r ?? {}).sort((a, b) => a[1].at - b[1].at);
  useEffect(() => { if (active) box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [active]);
  const send = () => { const x = text.trim(); if (!x) return; onReply(x); setText(''); };
  return (
    <div
      ref={box}
      className={'cm-card' + (active ? ' on' : '') + (t.resolved ? ' done' : '')}
      data-thread={id}
      onClick={onOpen}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <span className="cm-head">
        {t.quote && <span className="cm-quote">{t.quote}</span>}
        {onResolve && !t.resolved && (
          <button type="button" className="cm-ic done" aria-label="Mark as done" data-tip="Mark as done" onClick={(e) => { e.stopPropagation(); onResolve(); }}>
            <UiIcon name="check" size={17} />
          </button>
        )}
        {t.resolved && onReopen && (
          <button type="button" className="cm-btn" onClick={(e) => { e.stopPropagation(); onReopen(); }}>Open again</button>
        )}
      </span>
      <Message m={t} mine={t.by === me} onEdit={(x) => onEdit(null, x)} onDelete={() => onDelete(null)} deleteLabel="Delete this comment" />
      {replies.length > 0 && !active && (
        <span className="cm-count">{replies.length === 1 ? '1 reply' : `${replies.length} replies`}</span>
      )}
      {active && replies.map(([rid, r]) => (
        <Message key={rid} m={r} mine={r.by === me} onEdit={(x) => onEdit(rid, x)} onDelete={() => onDelete(rid)} deleteLabel="Delete" />
      ))}
      {active && !t.resolved && (
        <span className="cm-reply" onClick={(e) => e.stopPropagation()}>
          <textarea value={text} rows={1} placeholder="Reply" aria-label="Reply" enterKeyHint="send" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }} />
          {text.trim() && (
            <span className="cm-btns">
              <button type="button" className="cm-btn" onClick={() => setText('')}>Cancel</button>
              <button type="button" className="cm-btn primary" onClick={send}>Reply</button>
            </span>
          )}
        </span>
      )}
      {t.resolved && (
        <span className="cm-count">Marked as done{t.resolvedAt ? ` · ${when(t.resolvedAt)}` : ''}</span>
      )}
    </div>
  );
}

// A comment button in the margin beside the words you selected, as in other editors.
export function MarginComment({ editor, onComment }: { editor: Editor; onComment: () => void }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    let frame = 0;
    let blurTimer = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { selection } = editor.state;
        if (selection.empty || !editor.view.hasFocus() || !editor.isEditable) return setAt(null);
        const text = editor.state.doc.textBetween(selection.from, selection.to, ' ').trim();
        if (!text) return setAt(null);
        const page = (editor.view.dom.closest('.pg-paper, .cd-page') as HTMLElement | null) ?? editor.view.dom;
        const r = page.getBoundingClientRect();
        const c = editor.view.coordsAtPos(selection.from);
        const left = Math.min(window.innerWidth - 52, r.right + 10);
        const bar = document.querySelector('.cd-pagebar')?.getBoundingClientRect().bottom ?? 0;
        if (c.top < bar + 4 || c.top > window.innerHeight - 40) return setAt(null);
        setAt({ top: Math.max(8, c.top - 4), left });
      });
    };
    const onBlur = () => { window.clearTimeout(blurTimer); blurTimer = window.setTimeout(place, 120); };
    editor.on('selectionUpdate', place);
    editor.on('focus', place);
    editor.on('blur', onBlur);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(blurTimer);
      editor.off('selectionUpdate', place);
      editor.off('focus', place);
      editor.off('blur', onBlur);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [editor]);
  if (!at) return null;
  return createPortal(
    <button type="button" className="cm-margin" style={{ top: at.top, left: at.left }} aria-label="Add a comment (Ctrl+Alt+M)" data-tip="Add a comment · Ctrl+Alt+M" onMouseDown={(e) => e.preventDefault()} onClick={onComment}>
      <UiIcon name="discuss" size={18} />
    </button>,
    document.body,
  );
}

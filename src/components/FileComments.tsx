import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { DocRole, SharedDoc } from '../lib/sharedDocs';
import { UiIcon } from './UiIcon';
import { ago } from '../lib/activity';

// Comments on a file that is not a document: flashcards, Reading Journal, a lesson, a PDF. Everyone
// it is shared with reads them; people who can comment or edit write them; anyone who can edit
// marks one done.

type Comment = { id: string; by: string; name: string; text: string; at: number; done?: boolean };

export function FileComments({ d, role, me }: { d: SharedDoc; role: DocRole; me: { uid: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const owner = d.owner === me.uid;
  const canWrite = owner || role === 'edit' || role === 'comment' || role === 'suggest';
  const canResolve = owner || role === 'edit';
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'sharedDocs', d.id, 'comments'), orderBy('at', 'asc')),
        (s) => setList(s.docs.map((x) => ({ id: x.id, ...(x.data() as Omit<Comment, 'id'>) }))),
        () => setList([]),
      ),
    [d.id],
  );
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.fcm-toggle') && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const live = list.filter((c) => !c.done);
  const shown = showDone ? list : live;
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await addDoc(collection(db, 'sharedDocs', d.id, 'comments'), { by: me.uid, name: me.name || 'Someone', text: t.slice(0, 2000), at: Date.now() }).catch(() => setText(t));
  };
  return (
    <>
      <button type="button" className={'fcm-toggle btn small-btn' + (open ? ' on' : '')} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <UiIcon name="discuss" size={15} /> Comments{live.length ? ` ${live.length}` : ''}
      </button>
      {open && (
        <div className="fcm" ref={box} role="dialog" aria-label="Comments">
          <span className="fcm-head">
            <b>Comments</b>
            {list.some((c) => c.done) && (
              <button type="button" className="btn link small" onClick={() => setShowDone((v) => !v)}>
                {showDone ? 'Hide done' : 'Show done'}
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </span>
          <div className="fcm-list">
            {!shown.length && <span className="hint">{canWrite ? 'No comments yet. Write the first one below.' : 'No comments yet.'}</span>}
            {shown.map((c) => (
              <div key={c.id} className={'fcm-item' + (c.done ? ' done' : '')}>
                <span className="fcm-who">
                  <b>{c.name}</b>
                  <span className="hint">{ago(c.at)}</span>
                  <span style={{ flex: 1 }} />
                  {canResolve && (
                    <button type="button" className="btn link small" onClick={() => void updateDoc(doc(db, 'sharedDocs', d.id, 'comments', c.id), { done: !c.done })}>
                      {c.done ? 'Open again' : 'Done'}
                    </button>
                  )}
                  {(c.by === me.uid || owner) && (
                    <button type="button" className="btn link small" onClick={() => void deleteDoc(doc(db, 'sharedDocs', d.id, 'comments', c.id))}>
                      Delete
                    </button>
                  )}
                </span>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
          {canWrite ? (
            <span className="fcm-new">
              <textarea aria-label="Write a comment" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment" onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void send())} />
              <button type="button" className="btn small-btn primary" disabled={!text.trim()} onClick={() => void send()}>
                Send
              </button>
            </span>
          ) : (
            <span className="hint">You can view this file. To comment, ask its owner.</span>
          )}
        </div>
      )}
    </>
  );
}

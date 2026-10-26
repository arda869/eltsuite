import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { onValue, push, set, update } from 'firebase/database';
import { Highlight } from '../editor/Highlight';
import { TextColor, TextColorTool } from '../editor/TextColor';
import { Definition, DefinitionPop } from '../editor/Definition';
import { Ipa, newIpa } from '../editor/Ipa';
import { Stress, newStress } from '../editor/Stress';
import { IconNode, IconTool } from '../editor/Icons';
import { SymNode, SymbolTool } from '../editor/Symbols';
import { EditorClassContext } from '../editor/context';
import { newId } from '../lib/tasks';
import { UiIcon } from '../components/UiIcon';
import { claimStart, collabRef, RtdbProvider, setLock, watchFlags } from './provider';
import { CommentMark, commentSpots, listSuggestions, resolveAll, resolveSuggestion, SuggestDel, SuggestIns, Suggestions, type Author, type CollabMode } from './suggest';
import { downloadDocx, printDoc } from './export';

// A document the class writes together, live: everyone's cursor and name, editing,
// suggesting (changes others accept or reject) and comments, as in Google Docs.

const COLORS = ['#3d6fb6', '#7a5cb8', '#c7772f', '#b8508f', '#4f6b7a', '#a8861a', '#4a55a8', '#8a6a4a', '#2f7f95', '#9a5b2e'];
export const colorOf = (uid: string) => {
  let h = 0;
  for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};
export const MODE_LABEL: Record<CollabMode, { label: string; about: string; icon: string }> = {
  edit: { label: 'Editing', about: 'Change the text directly', icon: 'edit' },
  suggest: { label: 'Suggesting', about: 'Changes show as suggestions to accept or reject', icon: 'pen' },
  comment: { label: 'Commenting', about: 'Add comments; the text stays as it is', icon: 'discuss' },
  view: { label: 'Viewing', about: 'Read only', icon: 'revealAll' },
};

type Thread = { by: string; name: string; color: string; text: string; at: number; quote?: string; resolved?: boolean; r?: Record<string, { by: string; name: string; color: string; text: string; at: number }> };
export type CollabProps = {
  docKey: string;
  title: string;
  template?: JSONContent | null;
  modes: CollabMode[];
  teacher?: boolean;
  me: { uid: string; name: string };
  classId: string;
  display?: 'inline' | 'expand' | 'full';
  canDownload?: boolean;
  head?: ReactNode; // shown above the document (who it belongs to, a picker)
};

// Characters each person has written that are still in the document.
function contributions(doc: Y.Doc, pud: Y.PermanentUserData): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (t: Y.XmlFragment | Y.XmlElement | Y.XmlText) => {
    if (t instanceof Y.XmlText) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let item = (t as any)._start;
      while (item) {
        if (!item.deleted && item.content?.str) {
          const who = pud.getUserByClientId(item.id.client) ?? '';
          out.set(who, (out.get(who) ?? 0) + String(item.content.str).split(/\s+/).filter(Boolean).length);
        }
        item = item.right;
      }
    } else t.toArray().forEach((c) => walk(c as Y.XmlElement | Y.XmlText));
  };
  walk(doc.getXmlFragment('default'));
  return out;
}

export function CollabDoc({ docKey, title, template, modes, teacher, me, classId, display = 'inline', canDownload, head }: CollabProps) {
  const author: Author = { by: me.uid, name: me.name || 'Someone', color: colorOf(me.uid) };
  const session = useMemo(() => {
    const doc = new Y.Doc();
    const provider = new RtdbProvider(docKey, doc, me.uid);
    const pud = new Y.PermanentUserData(doc);
    pud.setUserMapping(doc, doc.clientID, me.uid);
    return { doc, provider, pud };
  }, [docKey, me.uid]);
  useEffect(
    () => () => {
      session.provider.destroy();
      session.doc.destroy();
    },
    [session],
  );
  const allowed = (teacher ? (['edit', 'suggest', 'comment'] as CollabMode[]) : modes).filter(Boolean);
  const [mode, setMode] = useState<CollabMode>(allowed[0] ?? 'view');
  useEffect(() => {
    if (!allowed.includes(mode)) setMode(allowed[0] ?? 'view');
  }, [allowed.join(), mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [flags, setFlags] = useState<{ lock?: boolean; shared?: boolean }>({});
  useEffect(() => watchFlags(docKey, setFlags, classId), [docKey, classId]);
  const locked = !!flags.lock && !teacher;
  const eff: CollabMode = locked ? 'view' : mode;
  const live = useRef({ mode: eff, author });
  live.current = { mode: eff, author };
  const [synced, setSynced] = useState(false);
  const [defOpen, setDefOpen] = useState(false);
  const [big, setBig] = useState(display === 'full' ? false : false);
  const [side, setSide] = useState<'none' | 'notes' | 'people'>('none');
  const [people, setPeople] = useState<{ name: string; color: string }[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [who, setWho] = useState<Record<string, { name: string; color: string }>>({});
  const [draft, setDraft] = useState<{ quote: string } | null>(null);
  const [draftText, setDraftText] = useState('');
  const [, tick] = useState(0);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ history: false, heading: { levels: [2, 3] }, codeBlock: false }),
        Underline,
        Highlight,
        TextColor,
        Definition,
        Ipa,
        Stress,
        IconNode,
        SymNode,
        SuggestIns,
        SuggestDel,
        CommentMark,
        Suggestions.configure({ get: () => live.current }),
        Placeholder.configure({ placeholder: 'Start writing…' }),
        Collaboration.configure({ document: session.doc }),
        CollaborationCursor.configure({ provider: session.provider, user: { name: author.name, color: author.color } }),
      ],
      editable: eff !== 'view',
      editorProps: { attributes: { class: 'cd-text', spellcheck: 'true' } },
      onTransaction: () => tick((n) => n + 1),
    },
    [session],
  );
  useEffect(() => editor?.setEditable(eff !== 'view'), [editor, eff]);

  // Sync, the starting text, and who is here.
  useEffect(() => {
    if (!editor) return;
    session.provider.whenSynced(async () => {
      setSynced(true);
      if (!template || session.doc.getXmlFragment('default').length > 0) return;
      if (await claimStart(docKey))
        editor
          .chain()
          .command(({ tr }) => (tr.setMeta('collab-ok', true), true))
          .setContent(template)
          .run();
    });
    const aw = session.provider.awareness;
    const f = () => setPeople([...aw.getStates().values()].map((s) => (s as { user?: { name: string; color: string } }).user).filter((u): u is { name: string; color: string } => !!u?.name));
    aw.on('change', f);
    f();
    set(collabRef(docKey, `who/${me.uid}`), { name: author.name, color: author.color }).catch(() => {});
    return () => aw.off('change', f);
  }, [editor, session, docKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onValue(collabRef(docKey, 'c'), (s) => setThreads((s.val() as Record<string, Thread>) ?? {})), [docKey]);
  useEffect(() => onValue(collabRef(docKey, 'who'), (s) => setWho((s.val() as Record<string, { name: string; color: string }>) ?? {})), [docKey]);
  useEffect(() => {
    if (!big) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setBig(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [big]);

  if (!editor) return <div className="cd cd-wait" />;
  const sugg = listSuggestions(editor.state.doc);
  const spots = commentSpots(editor.state.doc);
  const open = Object.entries(threads).filter(([, t]) => !t.resolved);
  const canResolve = !!teacher || (allowed.includes('edit') && !locked);
  const canComment = eff !== 'view';
  const sel = editor.state.selection;
  const quote = sel.empty ? '' : editor.state.doc.textBetween(sel.from, sel.to, ' ').slice(0, 160);

  const startComment = () => {
    if (!quote) return;
    setDraft({ quote });
    setDraftText('');
    setSide('notes');
  };
  const postComment = () => {
    const text = draftText.trim();
    if (!text || !draft) return;
    const id = newId();
    editor
      .chain()
      .command(({ tr }) => (tr.setMeta('collab-ok', true), true))
      .setMark('comment', { id })
      .run();
    set(collabRef(docKey, `c/${id}`), { by: author.by, name: author.name, color: author.color, text, at: Date.now(), quote: draft.quote }).catch(() => {});
    setDraft(null);
    setDraftText('');
  };
  const reply = (id: string, text: string) => text.trim() && set(push(collabRef(docKey, `c/${id}/r`)), { by: author.by, name: author.name, color: author.color, text: text.trim(), at: Date.now() }).catch(() => {});
  const resolve = (id: string) => {
    const spot = spots.find((s) => s.id === id);
    if (spot) {
      const tr = editor.state.tr.removeMark(spot.from, spot.to, editor.schema.marks.comment).setMeta('collab-ok', true);
      editor.view.dispatch(tr);
    }
    update(collabRef(docKey, `c/${id}`), { resolved: true }).catch(() => {});
  };
  const goTo = (from: number, to: number) => {
    editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
  };
  const B = (label: ReactNode, on: boolean, run: () => void, tip: string, disabled = false) => (
    <button type="button" className={'ne-btn' + (on ? ' on' : '')} data-tip={tip} aria-label={tip} aria-pressed={on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  const writing = eff === 'edit' || eff === 'suggest';
  const counts = side === 'people' ? contributions(session.doc, session.pud) : null;

  const body = (
    <div className={'cd' + (big ? ' big' : '') + ' m-' + eff}>
      <div className="cd-top">
        <span className="cd-title">
          <UiIcon name="task" size={16} />
          {title || 'Shared document'}
        </span>
        {head}
        <span className="cd-people" aria-label="In the document now">
          {people.slice(0, 6).map((p, i) => (
            <span key={i} className="cd-avatar" style={{ background: p.color }} title={p.name}>
              {p.name.trim().slice(0, 1).toUpperCase()}
            </span>
          ))}
          {people.length > 6 && <span className="cd-more">+{people.length - 6}</span>}
        </span>
        <span className="cd-mode">
          {locked ? (
            <span className="cd-locked">
              <UiIcon name="hideAnswers" size={14} /> Locked by your teacher
            </span>
          ) : allowed.length > 1 ? (
            <select value={mode} onChange={(e) => setMode(e.target.value as CollabMode)} aria-label="Mode">
              {allowed.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m].label}
                </option>
              ))}
            </select>
          ) : (
            <span className="cd-mode-one">{MODE_LABEL[eff].label}</span>
          )}
        </span>
        {teacher && (
          <button type="button" className={'btn small-btn' + (flags.lock ? ' primary' : '')} onClick={() => setLock(classId, docKey, !flags.lock)} data-tip={flags.lock ? 'Let learners change it again' : 'Stop learners changing it'}>
            {flags.lock ? 'Unlock' : 'Lock'}
          </button>
        )}
        {(teacher || canDownload) && <DownloadMenu onWord={() => downloadDocx(editor.getJSON(), title)} onPdf={() => printDoc(editor.getJSON(), title)} />}
        {display !== 'inline' || big ? (
          <button type="button" className="cd-icon" onClick={() => setBig(!big)} aria-label={big ? 'Back to the task' : 'Full screen'} data-tip={big ? 'Back to the task (Esc)' : 'Full screen'}>
            <UiIcon name={big ? 'fullscreenOff' : 'fullscreen'} size={16} />
          </button>
        ) : null}
      </div>
      {writing && (
        <div className="ne-bar cd-bar" role="toolbar" aria-label="Formatting">
          {B('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
          {B(<i>I</i>, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
          {B(<u>U</u>, editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline')}
          <TextColorTool editor={editor} />
          {B('▮', editor.isActive('highlight'), () => editor.chain().focus().toggleMark('highlight', { color: 'yellow' }).run(), 'Highlight')}
          {B('H', editor.isActive('heading'), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'Heading')}
          {B('•', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'List')}
          {B('1.', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Numbered list')}
          <span className="ne-sep" aria-hidden="true" />
          {B(
            <span className="ne-def">Aa</span>,
            editor.isActive('definition'),
            () => {
              if (editor.state.selection.empty && !editor.isActive('definition')) return;
              setDefOpen(true);
            },
            'Definition: select a word, then add its meaning',
            editor.state.selection.empty && !editor.isActive('definition'),
          )}
          {B(<span className="ne-ipa">/ə/</span>, false, () => editor.chain().focus().insertContent(newIpa('RP')).run(), 'IPA: phonemic symbols')}
          {B(<span className="ne-stress">Oo</span>, false, () => editor.chain().focus().insertContent(newStress('box')).run(), 'Word stress')}
          <IconTool editor={editor} />
          <SymbolTool editor={editor} />
          <span className="ne-sep" aria-hidden="true" />
          {B('↶', false, () => editor.chain().focus().undo().run(), 'Undo')}
          {B('↷', false, () => editor.chain().focus().redo().run(), 'Redo')}
          <span style={{ flex: 1 }} />
          {canComment && B(<UiIcon name="discuss" size={15} />, false, startComment, quote ? 'Comment on the selection' : 'Select some text to comment on it', !quote)}
        </div>
      )}
      {!writing && canComment && (
        <div className="ne-bar cd-bar">
          <span className="hint">Select text, then add a comment.</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn small-btn" disabled={!quote} onClick={startComment}>
            <UiIcon name="discuss" size={14} /> Comment
          </button>
        </div>
      )}
      <div className="cd-main">
        <div className="cd-page">
          {!synced && <span className="cd-sync">Opening the document…</span>}
          <EditorClassContext.Provider value={{ classId, classmates: [] }}>
            <EditorContent editor={editor} />
          </EditorClassContext.Provider>
        </div>
        <aside className={'cd-side' + (side === 'none' && !sugg.length && !open.length ? ' empty' : '')}>
          <span className="seg small-seg cd-tabs">
            <button type="button" className={side !== 'people' ? 'on' : ''} onClick={() => setSide('notes')}>
              Suggestions {sugg.length ? `(${sugg.length})` : ''} · Comments {open.length ? `(${open.length})` : ''}
            </button>
            {teacher && (
              <button type="button" className={side === 'people' ? 'on' : ''} onClick={() => setSide('people')}>
                Who wrote what
              </button>
            )}
          </span>
          {side === 'people' && counts ? (
            <div className="cd-who">
              {[...counts.entries()]
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([uid, n]) => (
                  <span key={uid} className="cd-who-row">
                    <span className="cd-dot" style={{ background: who[uid]?.color ?? '#999' }} />
                    {who[uid]?.name ?? 'Someone'}
                    <b>about {n} words</b>
                  </span>
                ))}
              {!counts.size && <span className="hint">Nothing written yet.</span>}
            </div>
          ) : (
            <>
              {canResolve && sugg.length > 1 && (
                <span className="cd-all">
                  <button type="button" className="btn small-btn" onClick={() => editor.view.dispatch(resolveAll(editor.state, true))}>
                    Accept all
                  </button>
                  <button type="button" className="btn small-btn" onClick={() => editor.view.dispatch(resolveAll(editor.state, false))}>
                    Reject all
                  </button>
                </span>
              )}
              {draft && (
                <div className="cd-card cd-draft">
                  <span className="cd-quote">“{draft.quote}”</span>
                  <textarea autoFocus value={draftText} placeholder="Your comment" onChange={(e) => setDraftText(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' && (e.metaKey || e.ctrlKey) ? postComment() : e.stopPropagation())} />
                  <span className="cd-card-btns">
                    <button type="button" className="btn small-btn" onClick={() => setDraft(null)}>
                      Cancel
                    </button>
                    <button type="button" className="btn small-btn primary" disabled={!draftText.trim()} onClick={postComment}>
                      Comment
                    </button>
                  </span>
                </div>
              )}
              {sugg.map((s, i) => (
                <div key={'s' + i} className="cd-card" style={{ ['--sg' as string]: s.color }} onClick={() => goTo(s.from, s.to)}>
                  <span className="cd-card-who">
                    <span className="cd-dot" style={{ background: s.color }} />
                    {s.name}
                    <span className="hint">{s.kind === 'ins' ? 'Add' : 'Delete'}</span>
                  </span>
                  <span className={s.kind === 'ins' ? 'sg-ins' : 'sg-del'} style={{ ['--sg' as string]: s.color }}>
                    {s.text.slice(0, 120)}
                  </span>
                  {canResolve && (
                    <span className="cd-card-btns">
                      <button
                        type="button"
                        className="btn small-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          editor.view.dispatch(resolveSuggestion(editor.state, s, false));
                        }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="btn small-btn primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          editor.view.dispatch(resolveSuggestion(editor.state, s, true));
                        }}
                      >
                        Accept
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {open
                .sort((a, b) => (spots.findIndex((s) => s.id === a[0]) + 1 || 1e9) - (spots.findIndex((s) => s.id === b[0]) + 1 || 1e9))
                .map(([id, t]) => (
                  <CommentCard key={id} t={t} onGo={() => spots.find((s) => s.id === id) && goTo(spots.find((s) => s.id === id)!.from, spots.find((s) => s.id === id)!.to)} onReply={(x) => reply(id, x)} onResolve={eff !== 'view' || teacher ? () => resolve(id) : undefined} />
                ))}
              {!sugg.length && !open.length && !draft && <span className="hint cd-none">{eff === 'suggest' ? 'Type to suggest a change. Others see it in your colour.' : 'Suggestions and comments show here.'}</span>}
            </>
          )}
        </aside>
      </div>
      <DefinitionPop editor={editor} open={defOpen} onClose={() => setDefOpen(false)} />
    </div>
  );
  if (display === 'full' && !big)
    return (
      <button type="button" className="cd-open" onClick={() => setBig(true)}>
        <span className="cd-open-icon">
          <UiIcon name="task" size={22} />
        </span>
        <span className="cd-open-text">
          <strong>{title || 'Shared document'}</strong>
          <span className="hint">{people.length > 1 ? `${people.length} people in it now` : 'Open the document'}</span>
        </span>
        <UiIcon name="fullscreen" size={18} />
      </button>
    );
  return big ? createPortal(<div className="cd-overlay">{body}</div>, document.body) : body;
}

function CommentCard({ t, onGo, onReply, onResolve }: { t: Thread; onGo: () => void; onReply: (text: string) => void; onResolve?: () => void }) {
  const [text, setText] = useState('');
  const replies = Object.values(t.r ?? {}).sort((a, b) => a.at - b.at);
  return (
    <div className="cd-card" onClick={onGo}>
      {t.quote && <span className="cd-quote">“{t.quote}”</span>}
      {[t, ...replies].map((c, i) => (
        <span key={i} className="cd-msg">
          <span className="cd-card-who">
            <span className="cd-dot" style={{ background: c.color }} />
            {c.name}
            <span className="hint">{new Date(c.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
          </span>
          <span className="cd-msg-text">{c.text}</span>
        </span>
      ))}
      <span className="cd-reply" onClick={(e) => e.stopPropagation()}>
        <input value={text} placeholder="Reply" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' ? (onReply(text), setText('')) : e.stopPropagation())} />
        {onResolve && (
          <button type="button" className="btn small-btn" onClick={onResolve} data-tip="Mark as done and hide it">
            Resolve
          </button>
        )}
      </span>
    </div>
  );
}

function DownloadMenu({ onWord, onPdf }: { onWord: () => void; onPdf: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span className="cd-dl" ref={ref}>
      <button type="button" className="cd-icon" onClick={() => setOpen((o) => !o)} aria-label="Download" data-tip="Download">
        <UiIcon name="export" size={16} />
      </button>
      {open && (
        <span className="cd-dl-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onWord())}>
            Word document (.docx)
          </button>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onPdf())}>
            PDF (print or save)
          </button>
        </span>
      )}
    </span>
  );
}

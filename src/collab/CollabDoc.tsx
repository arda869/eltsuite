import { BUILD, NewerGuard, OlderCopyBanner } from './guard';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { doc as fsDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { openChat } from '../lib/chat';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { onValue, push, set, update } from 'firebase/database';
import { HighlightTool } from '../editor/Highlight';
import { DOC_CMDS, DOC_GROUPS, DOC_SECTIONS, DOC_NODES, PRON_KEYS, addPictures, pickPictures } from './docKit';
import { SlashMenu, useSlash } from '../editor/TaskEditor';
import { InsertGallery } from '../editor/InsertGallery';
import { LineAdder } from '../editor/LineAdder';
import { BlockHandles } from '../editor/BlockMenu';
import { TableHandles } from '../editor/TableHandles';
import { TableInsert } from '../editor/TableInsert';
import { LinkPop } from '../editor/LessonLink';
import { EditorContextMenu } from '../editor/ContextMenu';
import { openMenuAt } from '../components/ContextMenu';
import { TextColorTool } from '../editor/TextColor';
import { DefinitionPop } from '../editor/Definition';
import { newIpa } from '../editor/Ipa';
import { newStress } from '../editor/Stress';
import { IconTool } from '../editor/Icons';
import { SymbolTool } from '../editor/Symbols';
import { EditorClassContext } from '../editor/context';
import { ProsodyTool } from '../editor/Prosody';
import { useToolGate } from '../lib/toolbarPrefs';
import { newId } from '../lib/tasks';
import { UiIcon } from '../components/UiIcon';
import { claimStart, collabRef, setLock, watchFlags } from './provider';
import { CommentMark, commentSpots, listSuggestions, resolveAll, resolveSuggestion, SuggestDel, SuggestIns, Suggestions, type Author, type CollabMode } from './suggest';
import { downloadDocx, printDoc, wordCount, EXPORT_DEFAULT, FONTS, type ExportOpts } from './export';
import { CiteTool, useCiteStyle } from '../editor/Cite';
import { useCollabSession, type CollabSession } from './session';
import { TaskRenderer } from '../components/TaskRenderer';
import { splitKey, type Responses } from '../lib/questions';

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
  suggest: { label: 'Suggesting', about: 'Suggest changes and add comments. Others accept or reject them.', icon: 'discuss' },
  comment: { label: 'Commenting', about: 'Add comments. The text stays as it is.', icon: 'discuss' },
  view: { label: 'Viewing', about: 'See it as learners do when you present it', icon: 'revealAll' },
};
// The modes offered: editing, then suggesting and commenting as one, then viewing.
export function modeChoices(modes: CollabMode[], teacher?: boolean): CollabMode[] {
  const base = (teacher ? (['edit', 'suggest'] as CollabMode[]) : modes).filter(Boolean);
  const one = base.includes('suggest') ? base.filter((m) => m !== 'comment') : base;
  return [...new Set([...one.filter((m) => m !== 'view'), 'view' as CollabMode])];
}
// The text as it stands: suggested additions left out, suggested deletions kept, no comment marks.
function withoutSuggestions(n: JSONContent): JSONContent {
  const marks = n.marks?.filter((m) => m.type !== 'suggestDel' && m.type !== 'comment');
  const content = n.content?.filter((c) => !c.marks?.some((m) => m.type === 'suggestIns')).map(withoutSuggestions);
  return { ...n, ...(n.marks ? { marks } : {}), ...(n.content ? { content } : {}) };
}
type Heading = { level: number; text: string; pos: number };
const headingsOf = (d: { forEach: (f: (n: { type: { name: string }; attrs: Record<string, unknown>; textContent: string; nodeSize: number }, off: number) => void) => void }) => {
  const out: Heading[] = [];
  d.forEach((n, off) => n.type.name === 'heading' && n.textContent.trim() && out.push({ level: Number(n.attrs.level) || 1, text: n.textContent.trim(), pos: off }));
  return out;
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
  page?: boolean; // its own page, like a Loop page: a wide canvas, tools on selection and "/"
  heading?: ReactNode; // the page title, at the top of the canvas
  toolSlot?: HTMLElement | null; // on its own page: the tools go up into the page's top bar
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

export function CollabDoc({ docKey, title, template, modes, teacher, me, classId, display = 'inline', canDownload, head, page, heading, toolSlot }: CollabProps) {
  const session = useCollabSession(docKey, me.uid);
  if (!session) return <div className="cd cd-wait" />;
  return <CollabInner {...{ docKey, title, template, modes, teacher, me, classId, display, canDownload, head, page, heading, toolSlot }} session={session} />;
}

function CollabInner({ docKey, title, template, modes, teacher, me, classId, display = 'inline', canDownload, head, page, heading, toolSlot, session }: CollabProps & { session: CollabSession }) {
  const author: Author = { by: me.uid, name: me.name || 'Someone', color: colorOf(me.uid) };
  const allowed = modeChoices(modes, teacher);
  const [mode, setMode] = useState<CollabMode>(allowed[0] ?? 'view');
  const [viewResp, setViewResp] = useState<Responses>({});
  const [toc, setToc] = useState(false);
  const [viewEl, setViewEl] = useState<HTMLDivElement | null>(null);
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
  const [gallery, setGallery] = useState(false);
  const [wcOpen, setWcOpen] = useState(false);
  const [personAt, setPersonAt] = useState<{ p: { name: string; color: string; uid?: string }; r: DOMRect } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const citeStyle = useCiteStyle();
  const profileTeacher = useAuth().profile?.role === 'teacher';
  const [side, setSide] = useState<'none' | 'notes' | 'people'>('none');
  const [people, setPeople] = useState<{ name: string; color: string; uid?: string }[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [who, setWho] = useState<Record<string, { name: string; color: string }>>({});
  const [draft, setDraft] = useState<{ quote: string } | null>(null);
  const [draftText, setDraftText] = useState('');
  const [, tick] = useState(0);
  const gate = useToolGate();

  const editor = useEditor(
    {
      extensions: [
        ...DOC_NODES,
        SuggestIns,
        SuggestDel,
        CommentMark,
        Suggestions.configure({ get: () => live.current }),
        Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : 'Type / to add a heading, table, picture, IPA and more'), showOnlyCurrent: true }),
        Collaboration.configure({ document: session.doc }),
        CollaborationCursor.configure({ provider: session.provider, user: { name: author.name, color: author.color, uid: me.uid, build: BUILD } }),
        NewerGuard,
      ],
      editable: eff !== 'view',
      editorProps: {
        attributes: { class: 'cd-text', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Document text' },
        handlePaste: (_v, e) => {
          const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
          if (!files.length || !edRef.current) return false;
          void addPictures(edRef.current, files);
          return true;
        },
        handleDrop: (v, e) => {
          const files = Array.from((e as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
          if (!files.length || !edRef.current) return false;
          e.preventDefault();
          const at = v.posAtCoords({ left: (e as DragEvent).clientX, top: (e as DragEvent).clientY })?.pos;
          void addPictures(edRef.current, files, at);
          return true;
        },
      },
      onTransaction: () => tick((n) => n + 1),
    },
    [session],
  );
  const edRef = useRef(editor);
  edRef.current = editor;
  useEffect(() => editor?.setEditable(eff !== 'view'), [editor, eff]);
  // The "/" menu: the lesson editor's elements, without learner tasks.
  const docCmds = useMemo(() => DOC_CMDS.filter((c) => (profileTeacher || !c.key.startsWith('tt-')) && (gate('pron') !== 'hide' || !PRON_KEYS.includes(c.key)) && (profileTeacher || c.key !== 'cite')), [profileTeacher, gate]);
  const slash = useSlash(editor, docCmds, false, true, () => true);
  // ⌘K: a link on the selected words.
  useEffect(() => {
    if (!editor) return;
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && (!editor.state.selection.empty || editor.isActive('link'))) {
        e.preventDefault();
        setLinkOpen(true);
      }
    };
    const dom = editor.view.dom;
    dom.addEventListener('keydown', key);
    return () => dom.removeEventListener('keydown', key);
  }, [editor]);

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
    const f = () => {
      const all = [...aw.getStates().values()].map((s) => (s as { user?: { name: string; color: string; uid?: string } }).user).filter((u): u is { name: string; color: string; uid?: string } => !!u?.name);
      // One circle a person, however many tabs they have open.
      setPeople(all.filter((u, i) => all.findIndex((v) => (v.uid ?? v.name) === (u.uid ?? u.name)) === i));
    };
    aw.on('change', f);
    f();
    set(collabRef(docKey, `who/${me.uid}`), { name: author.name, color: author.color }).catch(() => {});
    return () => aw.off('change', f);
  }, [editor, session, docKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onValue(collabRef(docKey, 'c'), (s) => setThreads((s.val() as Record<string, Thread>) ?? {})), [docKey]);
  useEffect(() => onValue(collabRef(docKey, 'who'), (s) => setWho((s.val() as Record<string, { name: string; color: string }>) ?? {})), [docKey]);
  useEffect(() => {
    if (!wcOpen) return;
    const f = () => tick((n) => n + 1);
    // A click anywhere else closes it.
    const away = (e: MouseEvent) => !(e.target as HTMLElement).closest?.('.cd-wc-wrap') && setWcOpen(false);
    document.addEventListener('selectionchange', f);
    document.addEventListener('mousedown', away);
    return () => (document.removeEventListener('selectionchange', f), document.removeEventListener('mousedown', away));
  }, [wcOpen]);
  useEffect(() => {
    if (!big) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setBig(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [big]);

  if (!editor) return <div className="cd cd-wait" />;
  // Viewing: the document as learners see it when it is presented, without suggestions still open.
  const viewing = eff === 'view';
  const viewDoc = viewing ? splitKey(withoutSuggestions(editor.getJSON())).content : null;
  const heads = headingsOf(editor.state.doc);
  const goHeading = (h: Heading, i: number) => {
    if (viewing) {
      const same = heads.slice(0, i).filter((x) => x.text === h.text).length;
      const el = [...(viewEl?.querySelectorAll('h1, h2, h3') ?? [])].filter((x) => x.textContent?.trim() === h.text)[same];
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const dom = editor.view.nodeDOM(h.pos) as HTMLElement | null;
    editor.chain().setTextSelection(h.pos + 1).run();
    dom?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
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
  // Words selected in the text, or anywhere else on the page (the title, say).
  const fieldSel = (() => {
    const a = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.selectionStart != null && a.selectionEnd != null ? a.value.slice(a.selectionStart, a.selectionEnd).trim() : '';
  })();
  const pageSel = fieldSel || (window.getSelection()?.toString().trim() ?? '');
  const inEditor = !sel.empty && editor.view.hasFocus();
  const selWords = inEditor || (!sel.empty && !pageSel) ? wordCount((editor.state.doc.cut(sel.from, sel.to).toJSON() ?? { type: 'doc' }) as JSONContent) : pageSel ? pageSel.split(/\s+/).filter(Boolean).length : 0;
  const anySel = selWords > 0;
  const showSide = side !== 'none' || !!draft || (!page && (sugg.length > 0 || open.length > 0));
  const counts = side === 'people' ? contributions(session.doc, session.pud) : null;

  const SV = ({ d, size = 16 }: { d: string; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
  const alignNow = (['center', 'right', 'justify'] as const).find((a) => editor.isActive({ textAlign: a })) ?? 'left';
  const ALIGN_D = { left: 'M4 6h16M4 10h10M4 14h16M4 18h10', center: 'M4 6h16M7 10h10M4 14h16M7 18h10', right: 'M4 6h16M10 10h10M4 14h16M10 18h10', justify: 'M4 6h16M4 10h16M4 14h16M4 18h16' };
  // The writing tools on a document page, in groups: history, style, text, lists, layout, language, writing, then comment and insert.
  const PageBar = () => (
    <div className="ne-bar cd-bar cd-pagebar" role="toolbar" aria-label="Formatting">
      <span className="pb-g">
        {B(<SV d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />, false, () => editor.chain().focus().undo().run(), 'Undo (Ctrl Z)', !editor.can().undo())}
        {B(<SV d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />, false, () => editor.chain().focus().redo().run(), 'Redo (Ctrl Shift Z)', !editor.can().redo())}
      </span>
      <span className="pb-g">
        <select
          className="ne-style pb-style"
          aria-label="Paragraph style"
          value={editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
          onChange={(e) => {
            const v = e.target.value;
            const c = editor.chain().focus();
            (v === 'p' ? c.setParagraph() : c.setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 })).run();
          }}
        >
          <option value="p">Text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </span>
      <span className="pb-g">
        {B(<b>B</b>, editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold (Ctrl B)')}
        {B(<i>I</i>, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic (Ctrl I)')}
        {B(<u>U</u>, editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline (Ctrl U)')}
        <TextColorTool editor={editor} />
        <HighlightTool editor={editor} />
      </span>
      <span className="pb-g">
        {B(<SV d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />, editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Bulleted list')}
        {B(<SV d="M10 6h10M10 12h10M10 18h10M4 5.5h1.5V9M4 9h3M4 14.5a1.5 1.5 0 0 1 3 0c0 1.5-3 2-3 3.5h3" />, editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Numbered list')}
        {B(<SV d="M4 6.5l1.5 1.5L8 5.5M4 12.5l1.5 1.5L8 11.5M11 7h9M11 13h9M11 19h9M4.5 18.5h3" />, editor.isActive('taskList'), () => editor.chain().focus().toggleTaskList().run(), 'Checklist')}
        <button type="button" className="ne-btn" data-tip="Alignment" aria-label="Alignment" onMouseDown={(e) => e.preventDefault()} onClick={(e) => openMenuAt(e.currentTarget, (['left', 'center', 'right', 'justify'] as const).map((a) => ({ label: { left: 'Left', center: 'Centre', right: 'Right', justify: 'Justify' }[a], icon: '', onClick: () => editor.chain().focus().setTextAlign(a).run() })))}>
          <SV d={ALIGN_D[alignNow]} />
        </button>
      </span>
      <span className="pb-g">
        {B(<UiIcon name="link" size={15} />, editor.isActive('link'), () => setLinkOpen(true), 'Link (Ctrl K)', editor.state.selection.empty && !editor.isActive('link'))}
        {B(<UiIcon name="picture" size={15} />, false, () => pickPictures(editor), 'Picture')}
        {B(<SV d="M4 5h16v14H4zM4 10h16M10 10v9" />, editor.isActive('table'), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), 'Table')}
      </span>
      <span className="pb-g">
        {gate('definition') !== 'hide' && B(<span className="ne-def">Aa</span>, editor.isActive('definition'), () => setDefOpen(true), 'Definition: select a word, then add its meaning', editor.state.selection.empty && !editor.isActive('definition'))}
        {gate('pron') !== 'hide' && <ProsodyTool editor={editor} />}
        {gate('symbols') !== 'hide' && <SymbolTool editor={editor} />}
        {gate('icons') !== 'hide' && <IconTool editor={editor} />}
      </span>
      <span className="pb-g">
        {profileTeacher && <CiteTool editor={editor} />}
        <span className="cd-wc-wrap">
          {B(<span className="cd-wc-ic">123</span>, wcOpen, () => setWcOpen((v) => !v), 'Word count')}
          {wcOpen && (
            <span className="cd-wc" role="status">
              <b>Word count</b>
              <span className="cd-wc-row">
                <span>Document</span>
                <b>{wordCount(editor.getJSON())}</b>
              </span>
              <span className="cd-wc-row">
                <span>Selected</span>
                <b>{anySel ? selWords : '–'}</b>
              </span>
              <span className="hint">Without the reference list, as assignments count them.</span>
            </span>
          )}
        </span>
      </span>
      <span className="pb-g pb-end">
        {canComment && B(<UiIcon name="discuss" size={15} />, false, startComment, quote ? 'Comment on the selection' : 'Select some text to comment on it', !quote)}
        <button type="button" className="btn small-btn pb-insert" onMouseDown={(e) => e.preventDefault()} onClick={() => setGallery(true)} data-tip="Everything you can add. You can also type / in the text.">
          <UiIcon name="plus" size={14} /> Insert
        </button>
      </span>
    </div>
  );
  const modeCtl = locked ? (
    <span className="cd-locked">
      <UiIcon name="lock" size={14} /> Locked
    </span>
  ) : allowed.length > 1 ? (
    <span className="cd-mode">
      <select value={mode} onChange={(e) => setMode(e.target.value as CollabMode)} aria-label="Mode">
        {allowed.map((m) => (
          <option key={m} value={m}>
            {MODE_LABEL[m].label}
          </option>
        ))}
      </select>
    </span>
  ) : (
    <span className="cd-mode-one">{MODE_LABEL[eff].label}</span>
  );
  const modeSeg =
    !locked && allowed.length > 1 ? (
      <span className="cd-modeseg" role="radiogroup" aria-label="Mode">
        {allowed.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} aria-label={MODE_LABEL[m].label} data-tip={MODE_LABEL[m].about}>
            <UiIcon name={MODE_LABEL[m].icon} size={15} />
            <span>{MODE_LABEL[m].label}</span>
          </button>
        ))}
      </span>
    ) : (
      modeCtl
    );
  const pageTools0 = page && toolSlot
    ? createPortal(
        <>
          <span className="cd-people" aria-label="In the document now">
            {people.slice(0, 5).map((p, i) => (
              <button key={i} type="button" className="cd-avatar" style={{ background: p.color }} title={p.name} onClick={(e) => setPersonAt({ p, r: (e.currentTarget as HTMLElement).getBoundingClientRect() })}>
                {p.name.trim().slice(0, 1).toUpperCase()}
              </button>
            ))}
            {people.length > 5 && <span className="cd-more">+{people.length - 5}</span>}
          </span>
          <button type="button" className={'dp-ib cd-cmt' + (showSide ? ' on' : '')} onClick={() => setSide(showSide ? 'none' : 'notes')} aria-label="Comments and suggestions" data-tip="Comments and suggestions">
            <UiIcon name="discuss" size={17} />
            {sugg.length + open.length > 0 && <b>{sugg.length + open.length}</b>}
          </button>
          {(teacher || canDownload) && <DownloadMenu onExport={(kind, o) => (kind === 'word' ? void downloadDocx(editor.getJSON(), title, { ...o, style: citeStyle }) : printDoc(editor.getJSON(), title, { ...o, style: citeStyle }, editor.view.dom))} />}
          {modeSeg}
        </>,
        toolSlot,
      )
    : null;
  const pageTools = (
    <>
      {pageTools0}
      {personAt && <PersonCard p={personAt.p} r={personAt.r} me={me.uid} onClose={() => setPersonAt(null)} />}
    </>
  );
  const body = (
    <div className={'cd' + (big ? ' big' : '') + ' m-' + eff + (locked ? ' is-locked' : '')}>
      {pageTools}
      {!(page && toolSlot) && <div className="cd-top">
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
              <UiIcon name="lock" size={14} /> Locked
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
        {teacher && classId && (
          <button type="button" className={'btn small-btn cd-lock' + (flags.lock ? ' on' : '')} onClick={() => setLock(classId, docKey, !flags.lock)} data-tip={flags.lock ? 'Let learners change it again' : 'Stop learners changing it'}>
            <UiIcon name={flags.lock ? 'lock' : 'unlock'} size={14} /> {flags.lock ? 'Locked' : 'Lock'}
          </button>
        )}
        {(teacher || canDownload) && <DownloadMenu onExport={(kind, o) => (kind === 'word' ? void downloadDocx(editor.getJSON(), title, { ...o, style: citeStyle }) : printDoc(editor.getJSON(), title, { ...o, style: citeStyle }, editor.view.dom))} />}
        {page && writing && (
          <button type="button" className="btn small-btn cd-insert" onClick={() => setGallery(true)} data-tip="Everything you can add. You can also type / in the text.">
            + Insert
          </button>
        )}
        {page && writing && profileTeacher && <CiteTool editor={editor} />}
        {page && (
          <button type="button" className={'cd-icon cd-cmt' + (showSide ? ' on' : '')} onClick={() => setSide(showSide ? 'none' : 'notes')} aria-label="Comments and suggestions" data-tip="Comments and suggestions">
            <UiIcon name="discuss" size={16} />
            {sugg.length + open.length > 0 && <b>{sugg.length + open.length}</b>}
          </button>
        )}
        <span className="cd-words" data-tip="Without the reference list">{wordCount(editor.getJSON())} words</span>
        {display !== 'inline' || big ? (
          <button type="button" className="cd-icon" onClick={() => setBig(!big)} aria-label={big ? 'Back to the task' : 'Full screen'} data-tip={big ? 'Back to the task (Esc)' : 'Full screen'}>
            <UiIcon name={big ? 'fullscreenOff' : 'fullscreen'} size={16} />
          </button>
        ) : null}
      </div>}
      {writing && page && PageBar()}
      {writing && !page && (
        <div className="ne-bar cd-bar" role="toolbar" aria-label="Formatting">
          {B('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
          {B(<i>I</i>, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
          {B(<u>U</u>, editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline')}
          <TextColorTool editor={editor} />
          <HighlightTool editor={editor} />
          {gate('heading') !== 'hide' && (
            <select
              className="ne-style"
              aria-label="Paragraph style"
              value={editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
              onChange={(e) => {
                const v = e.target.value;
                const c = editor.chain().focus();
                (v === 'p' ? c.setParagraph() : c.setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 })).run();
              }}
            >
              <option value="p">Normal text</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
            </select>
          )}
          {B('•', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'List')}
          {B('1.', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Numbered list')}
          {(['left', 'center', 'right', 'justify'] as const).map((a) =>
            B(
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d={a === 'left' ? 'M2 3h12M2 6.5h8M2 10h12M2 13.5h8' : a === 'center' ? 'M2 3h12M4 6.5h8M2 10h12M4 13.5h8' : a === 'right' ? 'M2 3h12M6 6.5h8M2 10h12M6 13.5h8' : 'M2 3h12M2 6.5h12M2 10h12M2 13.5h12'} />
              </svg>,
              editor.isActive({ textAlign: a }),
              () => editor.chain().focus().setTextAlign(a).run(),
              { left: 'Align left', center: 'Centre', right: 'Align right', justify: 'Justify' }[a],
            ),
          )}
          {gate('table') !== 'hide' && B(<UiIcon name="task" size={14} />, editor.isActive('table'), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), 'Insert a table')}
          {B(<UiIcon name="picture" size={14} />, false, () => pickPictures(editor), 'Insert a picture')}
          {profileTeacher && <CiteTool editor={editor} />}
          <span className="ne-sep" aria-hidden="true" />
          {gate('definition') !== 'hide' && B(
            <span className="ne-def">Aa</span>,
            editor.isActive('definition'),
            () => {
              if (editor.state.selection.empty && !editor.isActive('definition')) return;
              setDefOpen(true);
            },
            'Definition: select a word, then add its meaning',
            editor.state.selection.empty && !editor.isActive('definition'),
          )}
          {gate('icons') !== 'hide' && <IconTool editor={editor} />}
          {gate('symbols') !== 'hide' && <SymbolTool editor={editor} />}
          {gate('pron') !== 'hide' && <ProsodyTool editor={editor} />}
          <span className="ne-sep" aria-hidden="true" />
          {B('↶', false, () => editor.chain().focus().undo().run(), 'Undo')}
          {B('↷', false, () => editor.chain().focus().redo().run(), 'Redo')}
          <span style={{ flex: 1 }} />
          {page && B(<span className="ti-row"><UiIcon name="plus" size={14} /><span>Insert</span></span>, false, () => setGallery(true), 'Everything you can add. You can also type / in the text.')}
          {page && (
            <span className="cd-wc-wrap">
              {B(<span className="ti-row"><span className="cd-wc-ic">123</span><span>Word count</span></span>, wcOpen, () => setWcOpen((v) => !v), 'How many words, in all and in the selection')}
              {wcOpen && (
                <span className="cd-wc" role="status">
                  <b>Word count</b>
                  <span className="cd-wc-row">
                    <span>Document</span>
                    <b>{wordCount(editor.getJSON())}</b>
                  </span>
                  <span className="cd-wc-row">
                    <span>Selected</span>
                    <b>{anySel ? selWords : '–'}</b>
                  </span>
                  <span className="hint">Without the reference list, as assignments count them.</span>
                </span>
              )}
            </span>
          )}
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
      {flags.lock && (
        <div className={'cd-lockbar' + (teacher ? ' for-teacher' : '')} role="status">
          <UiIcon name="lock" size={16} />
          {teacher ? (
            <span>
              <b>Locked.</b> Learners can read it but cannot change it. You can still edit.
            </span>
          ) : (
            <span>
              <b>Your teacher has locked this document.</b> You can read it, but not change it for now.
            </span>
          )}
        </div>
      )}
      <div className={'cd-main' + (page && !showSide ? ' no-side' : '')}>
        <div className="cd-page">
          {heads.length > 0 && (
            <div className={'cd-toc' + (toc ? ' open' : '')}>
              <button type="button" className="cd-toc-btn" onClick={() => setToc((v) => !v)} aria-expanded={toc} aria-label={toc ? 'Hide the contents' : 'Show the contents'} data-tip={toc ? 'Hide the contents' : 'Contents'}>
                <SV d="M4 6h16M4 12h11M4 18h13" size={16} />
              </button>
              {toc && (
                <nav className="cd-toc-list" aria-label="Contents">
                  <b>Contents</b>
                  {heads.map((h, i) => (
                    <button key={i} type="button" className={'l' + Math.min(3, h.level)} onClick={() => goHeading(h, i)}>
                      {h.text}
                    </button>
                  ))}
                </nav>
              )}
            </div>
          )}
          {!synced && <span className="cd-sync">Opening the document…</span>}
          <OlderCopyBanner editor={editor} aw={session.provider.awareness} />
          {heading}
          {viewing && (
            <div className={'cd-view' + (page ? ' doc cd-doc' : ' doc')} ref={setViewEl}>
              <TaskRenderer content={viewDoc} responses={viewResp} onChange={(id, r) => setViewResp((x) => ({ ...x, [id]: r }))} classId={classId} />
            </div>
          )}
          <EditorClassContext.Provider value={{ classId, classmates: [] }}>
            <div className={'editor-host' + (page ? ' cd-host' : '')} ref={setHost} hidden={viewing}>
              <EditorContent editor={editor} className={page ? 'doc cd-doc' : undefined} />
              {page && writing && <LineAdder editor={editor} host={host} />}
              {page && writing && <BlockHandles editor={editor} host={host} space={classId} />}
              {writing && <TableHandles editor={editor} host={host} />}
              {writing && <TableInsert editor={editor} host={host} />}
            </div>
          </EditorClassContext.Provider>
        </div>
        {(!page || showSide) && <aside className={'cd-side' + (side === 'none' && !sugg.length && !open.length ? ' empty' : '')}>
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
        </aside>}
      </div>
      <DefinitionPop editor={editor} open={defOpen} onClose={() => setDefOpen(false)} />
      <LinkPop editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} places={[]} />
      {page && writing && (
        <EditorContextMenu
          editor={editor}
          host={host}
          linkLabel="Add a link"
          onDefinition={() => setDefOpen(true)}
          onLink={() => setLinkOpen(true)}
          actions={{
            stress: (t) => editor.chain().focus().insertContent({ ...newStress('box'), attrs: { ...newStress('box').attrs, syllables: [t] } }).run(),
            ipa: () => editor.chain().focus().insertContent([{ type: 'text', text: ' ' }, newIpa('RP')]).run(),
          }}
          extra={[
            { label: 'Comment', hint: 'on the selection', run: startComment, show: !!quote && canComment },
            { label: 'Turn into Heading 1', run: () => editor.chain().focus().setHeading({ level: 1 }).run(), show: !editor.isActive('heading', { level: 1 }) },
            { label: 'Turn into Heading 2', run: () => editor.chain().focus().setHeading({ level: 2 }).run(), show: !editor.isActive('heading', { level: 2 }) },
            { label: 'Turn into text', run: () => editor.chain().focus().setParagraph().run(), show: editor.isActive('heading') },
            { label: 'Bulleted list', run: () => editor.chain().focus().toggleBulletList().run() },
            { label: 'Checklist', run: () => editor.chain().focus().toggleTaskList().run() },
            { label: 'Insert…', hint: '/', run: () => setGallery(true) },
          ]}
        />
      )}
      {writing && <SlashMenu editor={editor} slash={slash} groups={DOC_GROUPS} />}
      {gallery && (
        <InsertGallery
          commands={docCmds}
          sections={DOC_SECTIONS}
          title="Add to the document"
          onClose={() => setGallery(false)}
          onPick={(key) => {
            setGallery(false);
            const c = docCmds.find((x) => x.key === key);
            if (c) window.setTimeout(() => c.run(editor), 0);
          }}
        />
      )}
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

export function CommentCard({ t, onGo, onReply, onResolve }: { t: Thread; onGo: () => void; onReply: (text: string) => void; onResolve?: () => void }) {
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

function DownloadMenu({ onExport }: { onExport: (kind: 'word' | 'pdf', o: ExportOpts) => void }) {
  const [open, setOpen] = useState<'' | 'menu' | 'word' | 'pdf'>('');
  const [o, setO] = useState<ExportOpts>(() => {
    try {
      return { ...EXPORT_DEFAULT, ...JSON.parse(localStorage.getItem('ll.exportOpts') || '{}') };
    } catch {
      return EXPORT_DEFAULT;
    }
  });
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen('');
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const go = () => {
    try {
      localStorage.setItem('ll.exportOpts', JSON.stringify(o));
    } catch {
      /* fine */
    }
    onExport(open as 'word' | 'pdf', o);
    setOpen('');
  };
  return (
    <span className="cd-dl" ref={ref}>
      <button type="button" className="cd-icon" onClick={() => setOpen((x) => (x ? '' : 'menu'))} aria-label="Download" data-tip="Download">
        <UiIcon name="import" size={16} />
      </button>
      {open === 'menu' && (
        <span className="cd-dl-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => setOpen('word')}>
            Word document (.docx)…
          </button>
          <button type="button" role="menuitem" onClick={() => setOpen('pdf')}>
            PDF (print or save)…
          </button>
        </span>
      )}
      {(open === 'word' || open === 'pdf') && (
        <span className="cd-dl-menu cd-export">
          <b>{open === 'word' ? 'Word document' : 'PDF'}</b>
          <label>
            Font
            <select value={o.font} onChange={(e) => setO({ ...o, font: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            Size
            <select value={o.size} onChange={(e) => setO({ ...o, size: Number(e.target.value) })}>
              {[10, 11, 12, 14].map((n) => (
                <option key={n} value={n}>
                  {n} pt
                </option>
              ))}
            </select>
          </label>
          <label>
            Line spacing
            <select value={o.spacing} onChange={(e) => setO({ ...o, spacing: Number(e.target.value) })}>
              {[1, 1.15, 1.5, 2].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={o.title} onChange={(e) => setO({ ...o, title: e.target.checked })} /> The title at the top
          </label>
          <label className="check-row">
            <input type="checkbox" checked={o.pageNumbers} onChange={(e) => setO({ ...o, pageNumbers: e.target.checked })} /> Page numbers
          </label>
          <label className="check-row">
            <input type="checkbox" checked={o.wordCount} onChange={(e) => setO({ ...o, wordCount: e.target.checked })} /> Word count at the end
          </label>
          <button type="button" className="btn primary small-btn" onClick={go}>
            Download
          </button>
        </span>
      )}
    </span>
  );
}

// Someone in the document: who they are, and a message to them.
function PersonCard({ p, r, me, onClose }: { p: { name: string; color: string; uid?: string }; r: DOMRect; me: string; onClose: () => void }) {
  const { user, profile } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ email?: string; role?: string } | null>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);
  useEffect(() => {
    if (!p.uid) return;
    void getDoc(fsDoc(db, 'users', p.uid))
      .then((s) => setInfo({ email: s.data()?.email, role: s.data()?.role }))
      .catch(() => setInfo({}));
  }, [p.uid]);
  const self = p.uid === me;
  const message = async () => {
    if (!user || !p.uid) return;
    setBusy(true);
    try {
      const role = (r: string | undefined) => (r === 'learner' ? 'learner' : 'teacher') as 'teacher' | 'learner';
      const id = await openChat({ key: user.uid, name: user.displayName || profile?.displayName || 'Me', role: role(profile?.role) }, [{ key: p.uid, name: p.name, role: role(info?.role) }]);
      window.open('/messages?c=' + id, '_blank');
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return createPortal(
    <div ref={ref} className="cd-person" role="dialog" aria-label={p.name} style={{ top: r.bottom + 8, left: Math.max(8, Math.min(r.left - 120, window.innerWidth - 268)) }}>
      <span className="cd-person-h">
        <span className="cd-avatar big" style={{ background: p.color }}>
          {p.name.trim().slice(0, 1).toUpperCase()}
        </span>
        <span>
          <b>{p.name}{self ? ' (you)' : ''}</b>
          <span className="hint">{info?.role === 'learner' ? 'Learner' : info?.role ? 'Teacher' : 'In this document now'}</span>
          {info?.email && info.role === 'learner' && profile?.role === 'teacher' && <span className="hint">{info.email}</span>}
        </span>
      </span>
      {!self && p.uid && (
        <button type="button" className="btn small-btn primary" disabled={busy} onClick={() => void message()}>
          <UiIcon name="message" size={14} /> Send a message
        </button>
      )}
    </div>,
    document.body,
  );
}

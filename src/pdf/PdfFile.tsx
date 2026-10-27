import { BUILD, NewerGuard, OlderCopyBanner } from '../collab/guard';
import { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { useAuth } from '../lib/auth';
import type { SharedDoc } from '../lib/sharedDocs';
import { useCollabSession, type CollabSession } from '../collab/session';
import { claimStart } from '../collab/provider';
import { colorOf } from '../collab/CollabDoc';
import { DOC_CMDS, DOC_GROUPS, DOC_NODES } from '../collab/docKit';
import { SlashMenu, useSlash } from '../editor/TaskEditor';
import { EditorClassContext } from '../editor/context';
import { TextColorTool } from '../editor/TextColor';
import { HighlightTool } from '../editor/Highlight';
import { ProsodyTool } from '../editor/Prosody';
import { SymbolTool } from '../editor/Symbols';
import { DefinitionPop } from '../editor/Definition';
import { UiIcon } from '../components/UiIcon';
import { PDF_NODES, ToolButtons } from './PdfNodes';
import { filePdfInfo } from './pdfData';

// A PDF in Files: its pages, with text boxes and highlights everyone it is shared with sees and
// changes live. The boxes hold anything a lesson can: text, IPA, gaps, choices.

const PdfDocument = Document.extend({ content: 'pdfBlock' });
const NODES = [...DOC_NODES.slice(1), PdfDocument, ...PDF_NODES];

export function PdfFile({ d, canEdit, me }: { d: SharedDoc; canEdit: boolean; me: { uid: string; name: string } }) {
  const session = useCollabSession(d.docKey, me.uid);
  if (!session) return <div className="dp-msg">Opening the PDF…</div>;
  return <Inner d={d} canEdit={canEdit} me={me} session={session} />;
}

function Inner({ d, canEdit, me, session }: { d: SharedDoc; canEdit: boolean; me: { uid: string; name: string }; session: CollabSession }) {
  const { profile } = useAuth();
  const [people, setPeople] = useState<{ name: string; color: string }[]>([]);
  const [ready, setReady] = useState(false);
  const [defOpen, setDefOpen] = useState(false);
  const editor = useEditor(
    {
      extensions: [
        // The shared starter kit without its document: here the document is one PDF.
        StarterKit.configure({ document: false, history: false, heading: { levels: [1, 2, 3] }, codeBlock: false, orderedList: false, listItem: false }),
        ...NODES,
        Placeholder.configure({ placeholder: 'Write here. Type / to add IPA, a gap, a choice and more' }),
        Collaboration.configure({ document: session.doc }),
        CollaborationCursor.configure({ provider: session.provider, user: { name: me.name || 'Someone', color: colorOf(me.uid), uid: me.uid, build: BUILD } }),
        NewerGuard,
      ],
      editable: canEdit,
      editorProps: { attributes: { class: 'pdf-doc', spellcheck: 'true' } },
    },
    [session],
  );
  useEffect(() => editor?.setEditable(canEdit), [editor, canEdit]);
  // The first person to open it puts the PDF in place.
  useEffect(() => {
    if (!editor) return;
    session.provider.whenSynced(async () => {
      setReady(true);
      const frag = session.doc.getXmlFragment('default');
      if (frag.length > 0 || !canEdit) return;
      const info = await filePdfInfo(d.id);
      if (!info || !(await claimStart(d.docKey))) return;
      editor
        .chain()
        .command(({ tr }) => (tr.setMeta('collab-ok', true), true))
        .setContent({ type: 'doc', content: [{ type: 'pdfBlock', attrs: { src: 'file:' + d.id, pages: info.pages, title: d.title }, content: [] }] })
        .run();
    });
    const aw = session.provider.awareness;
    const f = () => {
      const all = [...aw.getStates().values()].map((s) => (s as { user?: { name: string; color: string; uid?: string } }).user).filter((u): u is { name: string; color: string; uid?: string } => !!u?.name);
      setPeople(all.filter((u, i) => all.findIndex((v) => (v.uid ?? v.name) === (u.uid ?? u.name)) === i));
    };
    aw.on('change', f);
    f();
    return () => aw.off('change', f);
  }, [editor, session, d.id, d.docKey, d.title, canEdit]);
  const teacher = profile?.role === 'teacher';
  const cmds = useMemo(() => DOC_CMDS.filter((c) => teacher || (!c.key.startsWith('tt-') && c.key !== 'cite')), [teacher]);
  const slash = useSlash(editor, cmds, false, true, () => true);
  if (!editor) return <div className="dp-msg">Opening the PDF…</div>;
  const inBox = editor.isActive('pdfBox');
  const B = (label: React.ReactNode, on: boolean, run: () => void, tip: string, disabled = false) => (
    <button type="button" className={'ne-btn' + (on ? ' on' : '')} data-tip={tip} aria-label={tip} aria-pressed={on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  return (
    <div className="pdff">
      <div className="pdff-bar" role="toolbar" aria-label="PDF tools">
        {canEdit && <ToolButtons editor={editor} />}
        {canEdit && (
          <span className="pdff-fmt" aria-hidden={!inBox}>
            <span className="pb-sep" />
            {B(<b>B</b>, editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold', !inBox)}
            {B(<i>I</i>, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic', !inBox)}
            {B(<u>U</u>, editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline', !inBox)}
            <TextColorTool editor={editor} />
            <HighlightTool editor={editor} />
            <span className="pb-sep" />
            {B(<span className="ne-def">Aa</span>, editor.isActive('definition'), () => setDefOpen(true), 'Definition', !inBox || editor.state.selection.empty)}
            <ProsodyTool editor={editor} />
            <SymbolTool editor={editor} />
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span className="cd-people" aria-label="Here now">
          {people.slice(0, 6).map((p, i) => (
            <span key={i} className="cd-avatar" style={{ background: p.color }} title={p.name}>
              {p.name.trim().slice(0, 1).toUpperCase()}
            </span>
          ))}
        </span>
        <button type="button" className="btn small-btn" onClick={() => printPdf()} data-tip="Print it, or save it as a PDF, with the notes on the pages">
          <UiIcon name="import" size={14} /> Print or save
        </button>
      </div>
      {!ready && <span className="hint pdff-wait">Opening the pages…</span>}
      <OlderCopyBanner editor={editor} aw={session.provider.awareness} />
      <div className="pdff-page">
        <EditorClassContext.Provider value={{ classId: '', classmates: [] }}>
          <EditorContent editor={editor} />
        </EditorClassContext.Provider>
      </div>
      {canEdit && <SlashMenu editor={editor} slash={slash} groups={DOC_GROUPS} />}
      <DefinitionPop editor={editor} open={defOpen} onClose={() => setDefOpen(false)} />
    </div>
  );
}

// Print the pages as they are, with the notes on them: canvases become pictures first.
function printPdf() {
  const stack = document.querySelector('.pdff .pdf-stack');
  if (!stack) return;
  const clone = stack.cloneNode(true) as HTMLElement;
  const src = stack.querySelectorAll('canvas');
  clone.querySelectorAll('canvas').forEach((c, i) => {
    const img = document.createElement('img');
    try {
      img.src = (src[i] as HTMLCanvasElement).toDataURL('image/jpeg', 0.9);
    } catch {
      /* a page not drawn yet */
    }
    img.className = 'pdf-page';
    c.replaceWith(img);
  });
  clone.querySelectorAll('button, .pdf-box-bar, .pdf-size, .pdf-tools').forEach((x) => x.remove());
  const w = window.open('', '_blank');
  if (!w) return;
  const css = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((x) => x.outerHTML)
    .join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${document.title}</title><base href="${location.origin}/">${css}<style>html,body{background:#fff!important;margin:0;padding:0;display:block!important;height:auto!important;overflow:visible!important}.pdf-stack{box-shadow:none!important;border-radius:0!important;width:100%}.pdf-page+.pdf-page{border-top:0!important;break-before:page}@page{margin:0}</style></head><body>${clone.outerHTML}<script>setTimeout(()=>print(),900)</script></body></html>`);
  w.document.close();
}

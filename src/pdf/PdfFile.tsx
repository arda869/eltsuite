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
import { colorOf, PeopleHere } from '../collab/CollabDoc';
import { DOC_CMDS, DOC_GROUPS, DOC_NODES } from '../collab/docKit';
import { SlashMenu, useSlash } from '../editor/TaskEditor';
import { EditorClassContext } from '../editor/context';
import { TextColorTool } from '../editor/TextColor';
import { HighlightTool } from '../editor/Highlight';
import { ProsodyTool } from '../editor/Prosody';
import { SymbolTool } from '../editor/Symbols';
import { DefinitionPop } from '../editor/Definition';
import { UiIcon } from '../components/UiIcon';
import { ask, askText, tell } from '../lib/ask';
import { keyLabel } from '../lib/keys';
import { PDF_NODES, ToolButtons, ToolOptions, pdfStore, setPdfTool, toolHint, usePdfTool, TOOLS } from './PdfNodes';
import type { Editor } from '@tiptap/core';
import { filePdfInfo, type PageSize } from './pdfData';
import { PdfThumb, pageText } from './PdfStack';

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
  const [people, setPeople] = useState<{ name: string; color: string; uid?: string }[]>([]);
  const [ready, setReady] = useState(false);
  const [defOpen, setDefOpen] = useState(false);
  const [showKey, setShowKey] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [cur, setCur] = useState(0);
  const [reading, setReading] = useState(false);
  // The page in view: the last one whose top has passed the upper part of the screen.
  useEffect(() => {
    const f = () => {
      const list = Array.from(document.querySelectorAll<HTMLElement>('.pdff .pdf-page'));
      let best = 0;
      list.forEach((c, i) => void (c.getBoundingClientRect().top < window.innerHeight * 0.4 && (best = i)));
      setCur(best);
    };
    window.addEventListener('scroll', f, true);
    return () => window.removeEventListener('scroll', f, true);
  }, []);
  useEffect(() => () => speechSynthesis.cancel(), []);
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
      editorProps: { attributes: { class: 'pdf-doc', spellcheck: 'true', 'aria-label': 'Notes on the PDF' } },
    },
    [session],
  );
  useEffect(() => editor?.setEditable(canEdit), [editor, canEdit]);
  // Drawing together: everyone but the owner draws in their own colour to begin with.
  useEffect(() => {
    if (editor && d.owner !== me.uid) pdfStore(editor).ink = colorOf(me.uid);
  }, [editor, d.owner, me.uid]);
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
  // Keys for the tools (V, T, H, D, E) when you aren't writing, and Esc to stop.
  useEffect(() => {
    if (!editor || !canEdit) return;
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [role=dialog], [role=menu]')) return;
      const writing = !!t.closest('.pdf-doc') && editor.isActive('pdfBox');
      if (e.key === 'Escape') {
        if (pdfStore(editor).tool !== 'select' || pdfStore(editor).pending) return void setPdfTool(editor, 'select');
        if (writing) return void (editor.commands.blur(), window.getSelection()?.removeAllRanges());
        return;
      }
      if (writing) return;
      const tool = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (tool) (e.preventDefault(), setPdfTool(editor, tool.k));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [editor, canEdit]);
  const teacher = profile?.role === 'teacher';
  const cmds = useMemo(() => DOC_CMDS.filter((c) => teacher || (!c.key.startsWith('tt-') && c.key !== 'cite')), [teacher]);
  const slash = useSlash(editor, cmds, false, true, () => true);
  if (!editor) return <div className="dp-msg">Opening the PDF…</div>;
  const inBox = editor.isActive('pdfBox');
  const block = editor.state.doc.firstChild;
  const pages = ((block?.attrs.pages as PageSize[]) ?? []) as PageSize[];
  const hasKey = (() => {
    let k = false;
    block?.forEach((c) => void (c.attrs.key && (k = true)));
    return k;
  })();
  type Unit = { name: string; from: number; to: number };
  const units = ((block?.attrs.units as Unit[]) ?? []) as Unit[];
  const setUnits = (u: Unit[]) => editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, { ...block?.attrs, units: [...u].sort((a, b) => a.from - b.from) }));
  const addUnit = async () => {
    const name = (await askText('The unit’s name, for example “Unit 3 · Travel”', `Unit ${units.length + 1}`))?.trim();
    if (!name) return;
    const from = Math.min(pages.length, Math.max(1, Number(await askText(`First page of ${name}`, String(cur + 1))) || cur + 1));
    const to = Math.min(pages.length, Math.max(from, Number(await askText(`Last page of ${name}`, String(from))) || from));
    setUnits([...units, { name, from, to }]);
  };
  const canvases = () => Array.from(document.querySelectorAll<HTMLElement>('.pdff .pdf-page'));
  const goPage = (i: number) => canvases()[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const readAloud = async () => {
    if (reading) return (speechSynthesis.cancel(), setReading(false));
    const text = await pageText(String(block?.attrs.src ?? ''), '', cur).catch(() => '');
    if (!text) return void tell('This page is a picture of text (a scan), so there are no words to read yet. Reading scanned pages is on the way.');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 0.95;
    u.onend = () => setReading(false);
    u.onerror = () => setReading(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setReading(true);
  };
  const B = (label: React.ReactNode, on: boolean, run: () => void, tip: string, disabled = false) => (
    <button type="button" className={'ne-btn' + (on ? ' on' : '')} data-tip={tip} aria-label={tip} aria-pressed={on} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  const src = String(block?.attrs.src ?? '');
  const first = Number(block?.attrs.first) || 0;
  const fmt = (
    <span className="pdff-fmt" role="group" aria-label="The text in the box">
      {B(<b>B</b>, editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), `Bold (${keyLabel('Mod+B')})`)}
      {B(<i>I</i>, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), `Italic (${keyLabel('Mod+I')})`)}
      {B(<u>U</u>, editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), `Underline (${keyLabel('Mod+U')})`)}
      <TextColorTool editor={editor} />
      <HighlightTool editor={editor} />
      <span className="pb-sep" />
      {B(<span className="ne-def">Aa</span>, editor.isActive('definition'), () => setDefOpen(true), 'Definition: select a word first', editor.state.selection.empty)}
      <ProsodyTool editor={editor} />
      <SymbolTool editor={editor} />
    </span>
  );
  return (
    <div className="pdff">
      <div className="pdff-bar" role="toolbar" aria-label="PDF tools">
        {canEdit && <ToolButtons editor={editor} options={false} />}
        {canEdit && <Context editor={editor} inBox={inBox} fmt={fmt} />}
        <span className="pdff-grow" />
        {canEdit && (
          <span className="pdff-grp" role="group" aria-label="Undo">
            {B(<Svg d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />, false, () => editor.chain().focus().undo().run(), `Undo (${keyLabel('Mod+Z')})`, !editor.can().undo())}
            {B(<Svg d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />, false, () => editor.chain().focus().redo().run(), `Redo (${keyLabel('Mod+Shift+Z')})`, !editor.can().redo())}
          </span>
        )}
        {pages.length > 1 && (
          <span className="pdff-grp pdff-pg" role="group" aria-label="Pages">
            {B(<Svg d="m15 6-6 6 6 6" />, false, () => goPage(cur - 1), 'Page before', cur === 0)}
            <span className="pdff-pgn" aria-live="polite">
              {cur + 1}
              <span className="pdff-of"> of {pages.length}</span>
            </span>
            {B(<Svg d="m9 6 6 6-6 6" />, false, () => goPage(cur + 1), 'Next page', cur >= pages.length - 1)}
          </span>
        )}
        <span className="pdff-grp pdff-zoom" role="group" aria-label="Zoom">
          {B(<Svg d="M6 12h12" />, false, () => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2))), 'Smaller', zoom <= 0.5)}
          <button type="button" className="ne-btn pdff-zv" onClick={() => setZoom(1)} data-tip={zoom === 1 ? 'The pages fit the width' : 'Fit the width again'}>
            {zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}
          </button>
          {B(<Svg d="M6 12h12M12 6v12" />, false, () => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2))), 'Bigger', zoom >= 2.5)}
        </span>
        <span className="pdff-grp">
          <button type="button" className={'pdff-act' + (reading ? ' on' : '')} aria-pressed={reading} onClick={() => void readAloud()} data-tip={reading ? 'Stop reading' : `Read page ${cur + 1} aloud`}>
            <UiIcon name="music" size={15} />
            <span className="pdff-act-l">{reading ? 'Stop' : 'Read aloud'}</span>
          </button>
          {teacher && hasKey && (
            <button type="button" className={'pdff-act' + (showKey ? ' on' : '')} aria-pressed={showKey} onClick={() => setShowKey((v) => !v)} data-tip={showKey ? 'Hide the answer key: see the pages as learners do, or print without it' : 'Show the answer key: the boxes only teachers see'}>
              <Svg d="M15 7a4 4 0 1 1-3.9 4.8L4 19v-3h2v-2h2l3.1-3.1A4 4 0 0 1 15 7z" />
              <span className="pdff-act-l">Answer key</span>
            </button>
          )}
          <button type="button" className="pdff-act" onClick={() => printPdf()} data-tip="Print it, or save it as a PDF, with the notes on the pages">
            <UiIcon name="import" size={15} />
            <span className="pdff-act-l">Print or save</span>
          </button>
        </span>
        <PeopleHere people={people} me={me.uid} max={4} />
      </div>
      {canEdit && <Hint editor={editor} />}
      {!ready && <span className="hint pdff-wait">Opening the pages…</span>}
      <OlderCopyBanner editor={editor} aw={session.provider.awareness} />
      <div className="pdff-body">
        {pages.length > 1 && (
          <nav className="pdff-rail" aria-label="Pages">
            {pages.map((p, i) => {
              const u = units.find((x) => x.from === i + 1);
              const inUnit = units.find((x) => i + 1 >= x.from && i + 1 <= x.to);
              return (
                <span key={i} className="pdff-rail-i">
                  {u && (
                    <span className="pdff-unit" title={`${u.name}: pages ${u.from}–${u.to}`}>
                      <span>{u.name}</span>
                      {canEdit && (
                        <button type="button" className="pdff-unit-x" aria-label={`Remove ${u.name}`} onClick={() => void ask(`Remove the unit “${u.name}”? The pages stay.`).then((ok) => ok && setUnits(units.filter((x) => x !== u)))}>
                          ×
                        </button>
                      )}
                    </span>
                  )}
                  <button type="button" className={'pdff-th' + (i === cur ? ' on' : '') + (inUnit ? ' in-unit' : '')} aria-current={i === cur ? 'page' : undefined} aria-label={`Page ${i + 1}`} onClick={() => goPage(i)}>
                    <PdfThumb src={src} n={i + first} size={p} />
                    <span className="pdff-th-n">{i + 1}</span>
                  </button>
                </span>
              );
            })}
            {canEdit && (
              <button type="button" className="pdff-unit-add" onClick={() => void addUnit()} data-tip="Name a few pages as a unit, to put them into a lesson on their own">
                + Name a unit
              </button>
            )}
          </nav>
        )}
        <div className={'pdff-page' + (showKey && teacher ? '' : ' no-key')} style={{ ['--pdf-zoom' as string]: zoom }}>
          <EditorClassContext.Provider value={{ classId: '', classmates: [] }}>
            <EditorContent editor={editor} />
          </EditorClassContext.Provider>
        </div>
      </div>
      {canEdit && <SlashMenu editor={editor} slash={slash} groups={DOC_GROUPS} />}
      <DefinitionPop editor={editor} open={defOpen} onClose={() => setDefOpen(false)} />
    </div>
  );
}

const Svg = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

// The middle of the bar: the text tools while you write in a box, the colours of the highlighter or
// pen while you use them, and otherwise a word on what to do.
function Context({ editor, inBox, fmt }: { editor: Editor; inBox: boolean; fmt: React.ReactNode }) {
  const st = usePdfTool(editor);
  const colours = (st.tool === 'mark' && !st.pending) || st.tool === 'draw';
  return (
    <span className="pdff-ctx">
      <span className="pb-sep" />
      {colours ? <ToolOptions editor={editor} /> : inBox && st.tool === 'select' ? fmt : <span className="pdff-ctx-t">{st.tool === 'select' && !st.pending ? 'Click in a box to write in it' : ''}</span>}
    </span>
  );
}

// What to do with the tool in use, over the page.
function Hint({ editor }: { editor: Editor }) {
  usePdfTool(editor);
  const h = toolHint(editor);
  if (!h) return null;
  return (
    <div className="pdff-hint" role="status">
      <span>{h}</span>
      <button type="button" onClick={() => setPdfTool(editor, 'select')}>
        Done <kbd>Esc</kbd>
      </button>
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
  clone.querySelectorAll('button, .pdf-box-bar, .pdf-size, .pdf-tools, .pdf-keytag, .textLayer').forEach((x) => x.remove());
  if (stack.closest('.no-key')) clone.querySelectorAll('.is-key').forEach((x) => x.remove());
  const w = window.open('', '_blank');
  if (!w) return;
  const css = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((x) => x.outerHTML)
    .join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${document.title}</title><base href="${location.origin}/">${css}<style>html,body{background:#fff!important;margin:0;padding:0;display:block!important;height:auto!important;overflow:visible!important}.pdf-stack{box-shadow:none!important;border-radius:0!important;width:100%}.pdf-page+.pdf-page{border-top:0!important;break-before:page}@page{margin:0}</style></head><body>${clone.outerHTML}<script>setTimeout(()=>print(),900)</script></body></html>`);
  w.document.close();
}

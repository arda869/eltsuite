import { ActivityRefNode, insertActivityRef, REF_TOOL_FACE } from './ActivityRef';
import { InlineMedia, newInlineMedia } from './MediaNode';
import { EditorClassContext, useEditorClass } from './context';
import { UiIcon } from '../components/UiIcon';
import { useAuth } from '../lib/auth';
import { tell } from '../lib/ask';
import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { isSuiteScript, parseSuiteScript, toSuiteScript } from '../lib/suiteScript';
import { SUITE_TYPES } from './TaskEditor';
import { resolveSuiteScriptContent } from '../lib/suiteScriptResolve';
import { suiteScriptCopyNodes } from '../lib/suiteScriptCopy';
import { auth } from '../lib/firebase';
import { openMenu } from '../components/ContextMenu';
import { SuiteScriptSourceEditor } from './SuiteScriptSourceEditor';
import { captureFieldSelection, editFieldClipboard } from '../lib/fieldClipboard';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Highlight } from './Highlight';
import { TextColor, TextColorTool } from './TextColor';
import { Definition, DefinitionPop } from './Definition';
import { Ipa, newIpa, type Accent } from './Ipa';
import { Stress, newStress } from './Stress';
import { TaskRenderer } from '../components/TaskRenderer';
import { LANG_MARKS } from './langMarks';
import { ProsodyTool } from './Prosody';
import { SymbolTool } from './Symbols';
import { useToolGate } from '../lib/toolbarPrefs';

// The task instruction as rich text: bold, colour, highlight, a definition on a word, IPA, word stress.
// One line (Shift + Enter for a new line). The plain text is kept beside it for exports and search.
const plainDoc = (text: string): JSONContent => ({ type: 'doc', content: [text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }] });
const hasRich = (doc?: JSONContent | null) => !!doc && JSON.stringify(doc).match(/"(marks|ipa|stress|hardBreak|inlineMedia|activityRef)"/) !== null;
const instructionNodes = (nodes: JSONContent[]): JSONContent[] => {
  if (nodes.some(node => node.type !== 'paragraph' && node.type !== 'media')) throw new Error('This instruction supports text and inline audio or video. Put full activities in task content.');
  return nodes.map(node => node.type === 'media'
    ? { type: 'paragraph', content: [{ type: 'inlineMedia', attrs: node.attrs }] }
    : node);
};

export function InstrEditor({ doc, text, classId: givenClass, lessonId: givenLesson, onChange, placeholder = 'Instruction, for example: Complete the sentences.', suiteScriptEnabled = false, suiteScriptAudience = 'private', suiteScriptLearnerSeat = 0, suiteScriptPreviewAudience = 'learner' }: { doc?: JSONContent | null; text: string; classId?:string; lessonId?:string; onChange: (doc: JSONContent | null, text: string) => void; placeholder?: string; suiteScriptEnabled?: boolean; suiteScriptAudience?: 'private' | 'resourceHub'; suiteScriptLearnerSeat?: number; suiteScriptPreviewAudience?: 'learner' | 'teacher' }) {
  const ctx=useEditorClass();
  const [sourceMode, setSourceMode] = useState(false);
  const teacherRef = useRef(false);
  teacherRef.current = useAuth().profile?.role === 'teacher';
  const editorRef = useRef<Editor | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [defOpen, setDefOpen] = useState(false);
  const gate = useToolGate();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, listItem: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false }),
      Underline,
      InlineMedia,
      Highlight,
      TextColor,
      Definition,
      Ipa,
      Stress,
      ...LANG_MARKS,
      Link.configure({ openOnClick: false, autolink: true }),
      ActivityRefNode,
      Placeholder.configure({ placeholder }),
    ],
    content: doc ?? plainDoc(text),
    editorProps: {
      attributes: { class: 'instr-editor', 'aria-label': 'Instruction', role: 'textbox' },
      handlePaste: (_view, event) => {
        const plain = event.clipboardData?.getData('text/plain') ?? '';
        if (!teacherRef.current || !isSuiteScript(plain)) return false;
        event.preventDefault();
        const result = parseSuiteScript(plain, SUITE_TYPES);
        if (result.errors.length) { void tell(result.errors.join('\n')); return true; }
        void (async () => {
          try {
            const classId = givenClass || ctx.classId;
            const resolved = await resolveSuiteScriptContent(instructionNodes(result.content), suiteScriptAudience === 'resourceHub' ? { mode: 'resourceHub' } : classId && !classId.startsWith('user:') ? { mode: 'class', classId } : { mode: 'private' });
            const inline = resolved.content.flatMap((node, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...(node.content ?? [])]);
            inline.forEach(node => editorRef.current?.schema.nodeFromJSON(node).check());
            editorRef.current?.chain().focus().insertContent(inline).run();
            if (resolved.warnings.length) void tell(resolved.warnings.join('\n'));
          } catch (error) { void tell(`SuiteScript could not be pasted into this instruction: ${error instanceof Error ? error.message : String(error)}`); }
        })();
        return true;
      },
      // One paragraph: Enter does nothing, Shift + Enter makes a line break.
      handleKeyDown: (_view, e) => e.key === 'Enter' && !e.shiftKey,
    },
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON();
      const plain = e.getText({ blockSeparator: ' ' }).replace(/\s+/g, ' ').trim();
      // Keep only the plain text when nothing is formatted, so ordinary instructions stay simple.
      changeRef.current(hasRich(json) ? json : null, plain);
    },
  });
  editorRef.current = editor;
  useEffect(() => {
    if (!editor) return;
    const copy = () => {
      if (!teacherRef.current || !editor.isFocused) return;
      const nodes = editor.state.selection.empty ? editor.getJSON().content ?? [] : editor.state.selection.content().content.toJSON() as JSONContent[];
      void (async () => {
        try {
          const ready = auth.currentUser ? await suiteScriptCopyNodes(nodes, auth.currentUser.uid, givenClass || ctx.classId) : nodes;
          await navigator.clipboard.writeText(toSuiteScript(ready, SUITE_TYPES));
          void tell('SuiteScript copied as plain text.');
        } catch (error) { void tell(error instanceof Error ? error.message : 'Your browser could not copy SuiteScript.'); }
      })();
    };
    window.addEventListener('ll:copy-suitescript', copy);
    return () => window.removeEventListener('ll:copy-suitescript', copy);
  }, [editor]);
  useEffect(() => () => editor?.destroy(), [editor]);
  if (!editor) return null;
  const B = (label: React.ReactNode, on: boolean, run: () => void, title: string) => (
    <button type="button" className={'ne-btn' + (on ? ' on' : '')} data-tip={title} aria-label={title} aria-pressed={on} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  const lastAccent = () => {
    let a: Accent | undefined;
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'ipa') a = n.attrs.accent;
    });
    return a ?? 'RP';
  };
  const openSourceMenu = (event: React.MouseEvent) => {
    const field = (event.target as HTMLElement).closest('.instr-editor') as HTMLElement | null;
    if (!suiteScriptEnabled || !teacherRef.current || !field) return;
    const saved = captureFieldSelection(field);
    openMenu(event, [
      { label: 'Cut', disabled: !saved.text, onClick: () => void editFieldClipboard(field, 'cut', saved) },
      { label: 'Copy', disabled: !saved.text, onClick: () => void editFieldClipboard(field, 'copy', saved) },
      { label: 'Paste', onClick: () => { void navigator.clipboard.readText().then(value => { field.focus(); document.execCommand('insertText', false, value); }).catch(() => void tell('Use your normal Paste shortcut here.')); } },
      { label: 'Select all', onClick: () => editor.chain().focus().selectAll().run() },
      'sep',
      { label: 'Edit as SuiteScript', onClick: () => { setDefOpen(false); setSourceMode(true); } },
    ]);
  };
  return (
    <EditorClassContext.Provider value={{...ctx,classId:givenClass || ctx.classId,lessonId:givenLesson || ctx.lessonId}}><div className="instr-wrap" onContextMenu={openSourceMenu}>
      <EditorContent editor={editor} className="task-instr input" style={sourceMode ? { display: 'none' } : undefined} />
      <div className="ne-bar instr-bar" role="toolbar" aria-label="Instruction formatting" style={sourceMode ? { display: 'none' } : undefined}>
        {B('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
        {B('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
        {B('U', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline')}
        <TextColorTool editor={editor} />
        {B(<UiIcon name="video" size={15} />, false, () => editor.chain().focus().insertContent(newInlineMedia()).run(), "Embed a video")}
        {B('▮', editor.isActive('highlight'), () => editor.chain().focus().toggleMark('highlight', { color: 'yellow' }).run(), 'Highlight')}
        <span className="ne-sep" aria-hidden="true" />
        {B(
          <span className="ne-def">Aa</span>,
          editor.isActive('definition'),
          () => {
            if (editor.state.selection.empty && !editor.isActive('definition')) return void tell('Select a word or phrase first, then add its definition.');
            setDefOpen(true);
          },
          editor.isActive('definition') ? 'Edit the definition' : 'Definition: select a word, then add its meaning',
        )}
        {B(<span className="ne-ipa">/ə/</span>, false, () => editor.chain().focus().insertContent(newIpa(lastAccent())).run(), 'IPA: phonemic symbols, British or American')}
        {B(<span className="ne-stress">Oo</span>, false, () => editor.chain().focus().insertContent(newStress('box')).run(), 'Word stress: mark the stressed syllable')}
        {gate('symbols') !== 'hide' && <SymbolTool editor={editor} />}
        {gate('pron') !== 'hide' && <ProsodyTool editor={editor} />}
        <span className="ne-sep" aria-hidden="true" />
        {B(REF_TOOL_FACE, editor.isActive('activityRef'), () => void insertActivityRef(editor), 'Refer to another activity or to Learner A or B')}
      </div>
      <DefinitionPop editor={editor} open={defOpen} onClose={() => setDefOpen(false)} />
      {sourceMode && <SuiteScriptSourceEditor
        editor={editor}
        previewLearnerSeat={suiteScriptLearnerSeat}
        previewAudience={suiteScriptPreviewAudience}
        labels={SUITE_TYPES}
        commands={[]}
        textOnly
        title="Instruction"
        previewClassId={suiteScriptAudience === 'resourceHub' ? '' : givenClass || ctx.classId}
        referenceDestination={suiteScriptAudience === 'resourceHub' ? { mode: 'resourceHub' } : givenClass || ctx.classId ? (givenClass || ctx.classId).startsWith('user:') ? { mode: 'private' } : { mode: 'class', classId: givenClass || ctx.classId } : { mode: 'private' }}
        loadSource={async () => {
          const uid = auth.currentUser?.uid;
          if (!uid) throw new Error('Sign in before editing this instruction as SuiteScript.');
          const ready = await suiteScriptCopyNodes(editor.getJSON().content ?? [], uid, givenClass || ctx.classId);
          return toSuiteScript(ready, SUITE_TYPES);
        }}
        prepareContent={async (parsed) => {
          const place = givenClass || ctx.classId;
          const resolved = await resolveSuiteScriptContent(instructionNodes(parsed), suiteScriptAudience === 'resourceHub' ? { mode: 'resourceHub' } : place && !place.startsWith('user:') ? { mode: 'class', classId: place } : { mode: 'private' });
          const inline = resolved.content.flatMap((node, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...(node.content ?? [])]);
          return { content: [{ type: 'paragraph', ...(inline.length ? { content: inline } : {}) }], warnings: resolved.warnings };
        }}
        applyContent={(prepared) => { editor.commands.setContent({ type: 'doc', content: prepared }, true); }}
        onClose={() => { setSourceMode(false); window.requestAnimationFrame(() => editor.commands.focus()); }}
      />}
    </div></EditorClassContext.Provider>
  );
}

// The instruction as learners (and the teaching screen) see it.
export function InstrView({ doc, text, classId: givenClass }: { doc?: JSONContent | null; text: string; classId?:string }) {
  const { classId } = useEditorClass();
  const teacher=useAuth().profile?.role === 'teacher';
  if (!doc) return text ? <p className="task-instr">{text}</p> : null;
  return (
    <div className="task-instr rich">
      <TaskRenderer content={doc} responses={{}} classId={givenClass || classId} teacher={teacher} disabled />
    </div>
  );
}

import { tell } from '../lib/ask';
import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
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

// The task instruction as rich text: bold, colour, highlight, a definition on a word, IPA, word stress.
// One line (Shift + Enter for a new line). The plain text is kept beside it for exports and search.
const plainDoc = (text: string): JSONContent => ({ type: 'doc', content: [text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }] });
const hasRich = (doc?: JSONContent | null) => !!doc && JSON.stringify(doc).match(/"(marks|ipa|stress|hardBreak)"/) !== null;

export function InstrEditor({ doc, text, onChange, placeholder = 'Instruction, for example: Complete the sentences.' }: { doc?: JSONContent | null; text: string; onChange: (doc: JSONContent | null, text: string) => void; placeholder?: string }) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [defOpen, setDefOpen] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, listItem: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false }),
      Underline,
      Highlight,
      TextColor,
      Definition,
      Ipa,
      Stress,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: doc ?? plainDoc(text),
    editorProps: {
      attributes: { class: 'instr-editor', 'aria-label': 'Instruction', role: 'textbox' },
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
  return (
    <div className="instr-wrap">
      <EditorContent editor={editor} className="task-instr input" />
      <div className="ne-bar instr-bar" role="toolbar" aria-label="Instruction formatting">
        {B('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
        {B('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
        {B('U', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline')}
        <TextColorTool editor={editor} />
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
      </div>
      <DefinitionPop editor={editor} open={defOpen} onClose={() => setDefOpen(false)} />
    </div>
  );
}

// The instruction as learners (and the teaching screen) see it.
export function InstrView({ doc, text }: { doc?: JSONContent | null; text: string }) {
  if (!doc) return text ? <p className="task-instr">{text}</p> : null;
  return (
    <div className="task-instr rich">
      <TaskRenderer content={doc} responses={{}} disabled />
    </div>
  );
}

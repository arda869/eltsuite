import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Highlight } from '../editor/Highlight';
import { TextColor, TextColorTool } from '../editor/TextColor';
import { Definition, DefinitionPop } from '../editor/Definition';
import { Ipa, newIpa, type Accent } from '../editor/Ipa';
import { Stress, newStress } from '../editor/Stress';

// A small rich-text box for notebook notes. Learners and teachers get the same language tools as
// the task editor: a definition on a word, IPA with the phonemic chart, word stress, colour.
export function NoteEditor({ value, onChange, placeholder = 'Write the note', autoFocus }: { value: JSONContent | null | undefined; onChange: (v: JSONContent) => void; placeholder?: string; autoFocus?: boolean }) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [defOpen, setDefOpen] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, blockquote: false }), Underline, Highlight, TextColor, Definition, Ipa, Stress],
    content: value ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    autofocus: autoFocus ? 'end' : false,
    editorProps: { attributes: { class: 'note-editor', 'data-placeholder': placeholder } },
    onUpdate: ({ editor: e }) => changeRef.current(e.getJSON()),
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
    <div className="ne">
      <div className="ne-bar" role="toolbar" aria-label="Formatting">
        {B('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
        {B('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
        {B('U', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline')}
        <TextColorTool editor={editor} />
        {B('▮', editor.isActive('highlight'), () => editor.chain().focus().toggleMark('highlight', { color: 'yellow' }).run(), 'Highlight')}
        {B('•', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'List')}
        {B('1.', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Numbered list')}
        <span className="ne-sep" aria-hidden="true" />
        {B(
          <span className="ne-def">Aa</span>,
          editor.isActive('definition'),
          () => {
            if (editor.state.selection.empty && !editor.isActive('definition')) return void window.alert('Select a word or phrase first, then add its definition.');
            setDefOpen(true);
          },
          editor.isActive('definition') ? 'Edit the definition' : 'Definition: select a word, then add its meaning',
        )}
        {B(<span className="ne-ipa">/ə/</span>, false, () => editor.chain().focus().insertContent(newIpa(lastAccent())).run(), 'IPA: phonemic symbols, British or American')}
        {B(<span className="ne-stress">Oo</span>, false, () => editor.chain().focus().insertContent(newStress('box')).run(), 'Word stress: mark the stressed syllable')}
      </div>
      <EditorContent editor={editor} />
      <DefinitionPop editor={editor} open={defOpen} onClose={() => setDefOpen(false)} />
    </div>
  );
}

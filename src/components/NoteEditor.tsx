import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Highlight } from '../editor/Highlight';

// A small rich-text box for notebook notes: bold, italics, underline, highlight, lists.
export function NoteEditor({ value, onChange, placeholder = 'Write the note', autoFocus }: { value: JSONContent | null | undefined; onChange: (v: JSONContent) => void; placeholder?: string; autoFocus?: boolean }) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, blockquote: false }), Underline, Highlight],
    content: value ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    autofocus: autoFocus ? 'end' : false,
    editorProps: { attributes: { class: 'note-editor', 'data-placeholder': placeholder } },
    onUpdate: ({ editor: e }) => changeRef.current(e.getJSON()),
  });
  useEffect(() => () => editor?.destroy(), [editor]);
  if (!editor) return null;
  const B = (label: string, on: boolean, run: () => void, title: string) => (
    <button type="button" className={'ne-btn' + (on ? ' on' : '')} title={title} aria-pressed={on} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  );
  return (
    <div className="ne">
      <div className="ne-bar" role="toolbar" aria-label="Formatting">
        {B('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Bold')}
        {B('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Italic')}
        {B('U', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Underline')}
        {B('•', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'List')}
        {B('1.', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Numbered list')}
        {B('▮', editor.isActive('highlight'), () => editor.chain().focus().toggleMark('highlight', { color: 'yellow' }).run(), 'Highlight')}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

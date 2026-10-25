import { useEffect } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';

// A small rich-text box for long answers: bold, italics, underline and lists.
export function RichAnswer({ value, onChange, disabled, spellcheck, label }: { value: JSONContent | null; onChange: (v: JSONContent) => void; disabled?: boolean; spellcheck: boolean; label: string }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, code: false, blockquote: false, horizontalRule: false }), Underline],
    content: value ?? '',
    editable: !disabled,
    editorProps: { attributes: { spellcheck: spellcheck ? 'true' : 'false', 'aria-label': label, class: 'rich-answer-doc' } },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  if (!editor) return null;
  const b = (lbl: string, on: boolean, run: () => void, text: string) => (
    <button type="button" className={'tool' + (on ? ' on' : '')} aria-label={lbl} title={lbl} onMouseDown={(e) => e.preventDefault()} onClick={run} disabled={disabled}>
      {text}
    </button>
  );
  return (
    <div className={'rich-answer' + (disabled ? ' is-disabled' : '')}>
      {!disabled && (
        <div className="toolbar small">
          {b('Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'B')}
          {b('Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'I')}
          {b('Underline', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'U')}
          {b('Bulleted list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), '•')}
          {b('Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), '1.')}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

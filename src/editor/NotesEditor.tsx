import { useEffect } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Highlight, HighlightTool } from './Highlight';
import { TextColor, TextColorTool } from './TextColor';

// Rich text for teacher notes: bold, italic, underline, colour, highlight, headings, lists, links.
// Older notes saved as plain text open as paragraphs.
export const textToDoc = (text: string): JSONContent => ({ type: 'doc', content: (text || '').split('\n').map((l) => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })) });

const B = (label: string, on: boolean, run: () => void, body: React.ReactNode) => (
  <button type="button" className={'tool' + (on ? ' on' : '')} aria-label={label} title={label} aria-pressed={on} onMouseDown={(e) => e.preventDefault()} onClick={run}>
    {body}
  </button>
);

export function NotesEditor({ doc, text, onChange, placeholder, className = '' }: { doc?: JSONContent | null; text: string; onChange: (doc: JSONContent, text: string) => void; placeholder: string; className?: string }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [3, 4] }, codeBlock: false, code: false }), Underline, Highlight, TextColor, Link.configure({ openOnClick: true, autolink: true }), Placeholder.configure({ placeholder })],
    content: doc ?? textToDoc(text),
    onUpdate: ({ editor }) => onChange(editor.getJSON(), editor.getText({ blockSeparator: '\n' })),
  });
  // A different task: load its notes.
  useEffect(() => {
    if (!editor) return;
    const next = doc ?? textToDoc(text);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) editor.commands.setContent(next, false);
  }, [editor, doc, text]);
  if (!editor) return null;
  return (
    <div className={'notes-rich ' + className}>
      <div className="notes-tools" role="toolbar" aria-label="Notes formatting">
        {B('Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <b>B</b>)}
        {B('Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <i>I</i>)}
        {B('Underline', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <u>U</u>)}
        <TextColorTool editor={editor} />
        <HighlightTool editor={editor} />
        {B('Heading', editor.isActive('heading'), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <span style={{ fontWeight: 600 }}>H</span>)}
        {B('Bulleted list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), '•')}
        {B('Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), '1.')}
        {B(
          'Link',
          editor.isActive('link'),
          () => {
            if (editor.isActive('link')) return void editor.chain().focus().unsetLink().run();
            const href = window.prompt('Link address (https://…)');
            if (href && /^https?:\/\//.test(href)) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
          },
          '↗',
        )}
      </div>
      <EditorContent editor={editor} className="notes-body" />
    </div>
  );
}

// Read-only notes, formatted, for the teaching screen.
export function NotesView({ doc, text }: { doc?: JSONContent | null; text: string }) {
  const editor = useEditor({
    editable: false,
    extensions: [StarterKit.configure({ heading: { levels: [3, 4] }, codeBlock: false, code: false }), Underline, Highlight, TextColor, Link.configure({ openOnClick: true })],
    content: doc ?? textToDoc(text),
  });
  useEffect(() => {
    if (editor) editor.commands.setContent(doc ?? textToDoc(text), false);
  }, [editor, doc, text]);
  return <EditorContent editor={editor} className="notes-body notes-view" />;
}

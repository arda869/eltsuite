import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Gap, Mcq, newGap, newMcq } from './nodes';

type Cmd = { key: string; label: string; hint: string; group: 'Questions' | 'Text'; run: (e: Editor) => void };

const COMMANDS: Cmd[] = [
  { key: 'gap', label: 'Gap fill', hint: 'A blank inside a sentence', group: 'Questions', run: (e) => e.chain().focus().insertContent(newGap()).run() },
  {
    key: 'mcq',
    label: 'Multiple choice',
    hint: 'A question with options',
    group: 'Questions',
    run: (e) => e.chain().focus().insertContent([newMcq(), { type: 'paragraph' }]).run(),
  },
  { key: 'heading', label: 'Heading', hint: 'A small heading inside the task', group: 'Text', run: (e) => e.chain().focus().setNode('heading', { level: 3 }).run() },
  { key: 'list', label: 'Bulleted list', hint: 'A simple list', group: 'Text', run: (e) => e.chain().focus().toggleBulletList().run() },
  { key: 'numbered', label: 'Numbered list', hint: 'A list with numbers', group: 'Text', run: (e) => e.chain().focus().toggleOrderedList().run() },
  {
    key: 'image',
    label: 'Image',
    hint: 'From a web address',
    group: 'Text',
    run: (e) => {
      const src = window.prompt('Image address (https://…)');
      if (src && /^https:\/\//.test(src)) e.chain().focus().setImage({ src }).run();
    },
  },
  { key: 'quote', label: 'Quote', hint: 'Set a passage apart', group: 'Text', run: (e) => e.chain().focus().toggleBlockquote().run() },
];

function useSlash(editor: Editor | null) {
  const [state, setState] = useState<{ query: string; from: number; to: number; top: number; left: number } | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { from, empty } = editor.state.selection;
      if (!empty) return setState(null);
      const $from = editor.state.selection.$from;
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
      const m = before.match(/(?:^|\s)\/([a-z ]{0,20})$/i);
      if (!m) return setState(null);
      const start = from - m[1].length - 1;
      const coords = editor.view.coordsAtPos(from);
      const host = editor.view.dom.getBoundingClientRect();
      setState({ query: m[1].toLowerCase(), from: start, to: from, top: coords.bottom - host.top + 6, left: coords.left - host.left });
      setIndex(0);
    };
    editor.on('transaction', update);
    return () => {
      editor.off('transaction', update);
    };
  }, [editor]);

  const items = useMemo(
    () => (state ? COMMANDS.filter((c) => (c.label + ' ' + c.key).toLowerCase().includes(state.query.trim())) : []),
    [state],
  );

  const choose = (c: Cmd) => {
    if (!editor || !state) return;
    editor.chain().focus().deleteRange({ from: state.from, to: state.to }).run();
    c.run(editor);
    setState(null);
  };

  return { state: items.length ? state : null, items, index, setIndex, choose, close: () => setState(null) };
}

const BTN = (label: string, active: boolean, onClick: () => void, text: string) => (
  <button type="button" className={'tool' + (active ? ' on' : '')} aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
    {text}
  </button>
);

export function TaskEditor({ content, onChange }: { content: JSONContent; onChange: (c: JSONContent) => void }) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [3] } }),
      Underline,
      Image,
      Gap,
      Mcq,
      Placeholder.configure({ placeholder: 'Write the task. Type / for a question, list or image.' }),
    ],
    content,
    onUpdate: ({ editor }) => changeRef.current(editor.getJSON()),
  });

  const slash = useSlash(editor);

  useEffect(() => {
    if (!editor || !slash.state) return;
    const onKey = (e: KeyboardEvent) => {
      if (!slash.state) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slash.setIndex((i) => (i + 1) % slash.items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        slash.setIndex((i) => (i - 1 + slash.items.length) % slash.items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        slash.choose(slash.items[slash.index]);
      } else if (e.key === 'Escape') {
        slash.close();
      }
    };
    const dom = editor.view.dom;
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, [editor, slash]);

  if (!editor) return null;

  return (
    <div className="task-editor">
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        {BTN('Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'B')}
        {BTN('Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'I')}
        {BTN('Underline', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'U')}
        {BTN('Heading', editor.isActive('heading'), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'H')}
        {BTN('Bulleted list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), '•')}
        <span className="tool-sep" />
        {BTN('Insert gap', false, () => editor.chain().focus().insertContent(newGap()).run(), '+ Gap')}
        {BTN('Insert multiple choice', false, () => editor.chain().focus().insertContent([newMcq(), { type: 'paragraph' }]).run(), '+ Multiple choice')}
      </div>
      <div className="editor-host">
        <EditorContent editor={editor} className="doc" />
        {slash.state && (
          <div className="slash" role="listbox" aria-label="Insert" style={{ top: slash.state.top, left: Math.max(0, slash.state.left - 8) }}>
            {(['Questions', 'Text'] as const).map((g) => {
              const list = slash.items.filter((c) => c.group === g);
              if (!list.length) return null;
              return (
                <div key={g}>
                  <span className="slash-group">{g}</span>
                  {list.map((c) => {
                    const i = slash.items.indexOf(c);
                    return (
                      <div
                        key={c.key}
                        role="option"
                        aria-selected={i === slash.index}
                        className={'slash-item' + (i === slash.index ? ' on' : '')}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          slash.choose(c);
                        }}
                        onMouseEnter={() => slash.setIndex(i)}
                      >
                        <strong>{c.label}</strong>
                        <span>{c.hint}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

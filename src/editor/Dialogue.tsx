import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import type { CSSProperties } from 'react';
import { Grip } from './nodes';

// A dialogue: lines said by A and B (or by named people). Each line can hold gaps, choices and
// anything else that sits in a sentence. One line under the other, or the speakers side by side.
// It can go anywhere, also as an item of a numbered list.

export type DialogueLayout = 'stacked' | 'side';
// The names, for the labels (drawn by the style sheet), and a label column as wide as the longest name.
export const speakerVars = (speakers: string[]) => {
  const list = speakers.length ? speakers : ['A', 'B'];
  const longest = Math.max(1, ...list.map((s) => s.length));
  return { ...Object.fromEntries(list.map((s, i) => [`--s${i}`, JSON.stringify(s || ' ')])), '--dw': longest <= 2 ? '28px' : `calc(${longest} * .55em + 18px)` } as CSSProperties;
};

function DialogueView({ node, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const speakers: string[] = Array.isArray(node.attrs.speakers) && node.attrs.speakers.length ? node.attrs.speakers : ['A', 'B'];
  const layout: DialogueLayout = node.attrs.layout === 'side' ? 'side' : 'stacked';
  const setSpeaker = (i: number, v: string) => updateAttributes({ speakers: speakers.map((s, k) => (k === i ? v : s)) });
  // A click on a speaker's name in a line gives that line to the next speaker.
  const onClick = (e: React.MouseEvent) => {
    const who = (e.target as HTMLElement).closest('.dl-who');
    if (!who || !editor.isEditable) return;
    e.preventDefault();
    const line = who.closest('[data-dline]') as HTMLElement | null;
    if (!line) return;
    const pos = editor.view.posAtDOM(line, 0) - 1;
    const n = editor.state.doc.nodeAt(pos);
    if (!n || n.type.name !== 'dialogueLine') return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, who: ((Number(n.attrs.who) || 0) + 1) % speakers.length }));
  };
  return (
    <NodeViewWrapper className={'dialogue-node'}>
      {editor.isEditable && (
        <div className="dlg-tools" contentEditable={false}>
          <Grip editor={editor} getPos={getPos} />
          <span className="pop-type">Dialogue</span>
          <span className="dlg-names">
            {speakers.map((s, i) => (
              <span key={i} className="dlg-name">
                <input value={s} size={Math.max(2, s.length + 1)} aria-label={`Speaker ${i + 1}`} placeholder={String.fromCharCode(65 + i)} onChange={(e) => setSpeaker(i, e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                {speakers.length > 2 && (
                  <button type="button" aria-label="Remove this speaker" onClick={() => updateAttributes({ speakers: speakers.filter((_, k) => k !== i) })}>
                    ×
                  </button>
                )}
              </span>
            ))}
            {speakers.length < 4 && (
              <button type="button" className="dlg-add" onClick={() => updateAttributes({ speakers: [...speakers, String.fromCharCode(65 + speakers.length)] })}>
                + Speaker
              </button>
            )}
          </span>
          <span className="seg small-seg" role="radiogroup" aria-label="Layout">
            {(
              [
                ['stacked', 'One under the other'],
                ['side', 'Side by side'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={layout === k} className={layout === k ? 'on' : ''} onClick={() => updateAttributes({ layout: k })}>
                {l}
              </button>
            ))}
          </span>
          <button type="button" className="remove" onClick={deleteNode}>
            Remove
          </button>
        </div>
      )}
      <div className={'dialogue layout-' + layout + ' n' + speakers.length} style={speakerVars(speakers)} onMouseDown={onClick}>
        <NodeViewContent className="dlg-lines" />
      </div>
    </NodeViewWrapper>
  );
}

export const DialogueNode = Node.create({
  name: 'dialogue',
  group: 'block',
  content: 'dialogueLine+',
  defining: true,
  draggable: true,
  addAttributes: () => ({
    speakers: { default: ['A', 'B'] },
    layout: { default: 'stacked' },
  }),
  parseHTML: () => [{ tag: 'div[data-dialogue]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-dialogue': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(DialogueView),
});

export const DialogueLine = Node.create({
  name: 'dialogueLine',
  priority: 1000, // its Enter comes before the list's
  content: 'inline*',
  defining: true,
  addAttributes: () => ({ who: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-who')) || 0, renderHTML: (a: { who: number }) => ({ 'data-who': a.who }) } }),
  parseHTML: () => [{ tag: 'div[data-dline]', contentElement: '.dl-text' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-dline': '', class: 'dl' }), ['span', { class: 'dl-who', contenteditable: 'false', title: 'Click to change who says this' }], ['div', { class: 'dl-text' }, 0]],
  addKeyboardShortcuts() {
    return {
      // Enter: a new line for the next speaker. Enter on an empty last line: leave the dialogue.
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type.name !== 'dialogueLine') return false;
        const dlg = $from.node(-1);
        const count = Math.max(2, (dlg.attrs.speakers as string[] | undefined)?.length ?? 2);
        if ($from.parent.content.size === 0 && $from.index(-1) === dlg.childCount - 1 && dlg.childCount > 1) {
          const tr = editor.state.tr;
          const start = $from.before();
          tr.delete(start, start + $from.parent.nodeSize);
          // In a list, the next item; anywhere else, a new line under the dialogue.
          const inItem = $from.depth >= 3 && $from.node(-2).type.name === 'listItem' && $from.index(-2) === $from.node(-2).childCount - 1;
          const after = tr.mapping.map(inItem ? $from.after(-2) : $from.after(-1));
          const para = editor.schema.nodes.paragraph.create();
          tr.insert(after, inItem ? editor.schema.nodes.listItem.create(null, para) : para);
          tr.setSelection(TextSelection.create(tr.doc, after + (inItem ? 2 : 1)));
          editor.view.dispatch(tr.scrollIntoView());
          return true;
        }
        const next = ((Number($from.parent.attrs.who) || 0) + 1) % count;
        return editor.chain().splitBlock().updateAttributes('dialogueLine', { who: next }).run();
      },
      'Shift-Enter': ({ editor }) => editor.state.selection.$from.parent.type.name === 'dialogueLine' && editor.commands.setHardBreak(),
    };
  },
});

// Put a dialogue at the cursor, with the cursor in its first line.
export function insertDialogue(editor: import('@tiptap/react').Editor) {
  editor
    .chain()
    .focus()
    .insertContent(newDialogue())
    .command(({ tr }) => {
      const $p = tr.selection.$from;
      for (let d = $p.depth; d > 0; d--)
        if ($p.node(d).type.name === 'dialogue') {
          tr.setSelection(TextSelection.create(tr.doc, $p.start(d) + 1));
          return true;
        }
      return true;
    })
    .run();
}

export const newDialogue = () => ({
  type: 'dialogue',
  attrs: { speakers: ['A', 'B'], layout: 'stacked' },
  content: [{ type: 'dialogueLine', attrs: { who: 0 } }],
});

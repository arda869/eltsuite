import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { newId } from '../lib/tasks';
import { Grip } from './nodes';
import { Board, type BoardAttrs } from '../components/Board';

// Message board or post-it wall: learners post live, the class sees it straight away.

function BoardView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const a = node.attrs as BoardAttrs;
  const toggle = (k: 'replies' | 'reactions' | 'anonymous', label: string, hint: string) => (
    <label className="r-share">
      <input type="checkbox" checked={!!a[k]} onChange={() => updateAttributes({ [k]: !a[k] })} />
      {label}
      <span className="hint">{hint}</span>
    </label>
  );
  return (
    <NodeViewWrapper className={'block-node board-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">{a.mode === 'postits' ? 'Post-it wall' : 'Message board'}</span>
        <span className="seg small-seg" role="radiogroup" aria-label="Type">
          <button type="button" role="radio" aria-checked={a.mode !== 'postits'} className={a.mode !== 'postits' ? 'on' : ''} onClick={() => updateAttributes({ mode: 'board' })}>
            Message board
          </button>
          <button type="button" role="radio" aria-checked={a.mode === 'postits'} className={a.mode === 'postits' ? 'on' : ''} onClick={() => updateAttributes({ mode: 'postits' })}>
            Post-it wall
          </button>
        </span>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <input className="r-title" value={a.prompt ?? ''} placeholder="Question or instruction, for example: What would you take to a desert island?" onChange={(e) => updateAttributes({ prompt: e.target.value })} />
      <div className="board-settings">
        {toggle('replies', 'Replies', 'Learners can reply to a message')}
        {toggle('reactions', 'Reactions', 'Hearts, likes, claps and ideas')}
        {toggle('anonymous', 'Anonymous', 'Learners’ names aren’t shown')}
        <label className="r-share">
          <input type="checkbox" checked={a.tagging !== false} onChange={() => updateAttributes({ tagging: a.tagging === false })} />
          Tagging
          <span className="hint">Learners can type @ to tag a classmate or you, and that person gets a notification</span>
        </label>
      </div>
      <div className="board-preview">
        <Board attrs={a} preview />
      </div>
    </NodeViewWrapper>
  );
}

export const BoardNode = Node.create({
  name: 'board',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: null },
    mode: { default: 'board' },
    prompt: { default: '' },
    replies: { default: true },
    reactions: { default: true },
    anonymous: { default: false },
    tagging: { default: true },
  }),
  parseHTML: () => [{ tag: 'div[data-board]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-board': '' })],
  addNodeView: () => ReactNodeViewRenderer(BoardView),
});

export const newBoard = (mode: 'board' | 'postits' = 'board') => ({ type: 'board', attrs: { id: newId(), mode, prompt: '', replies: true, reactions: true, anonymous: false } });

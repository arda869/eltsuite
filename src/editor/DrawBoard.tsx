import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { newId } from '../lib/tasks';
import { useAuth } from '../lib/auth';
import { Grip } from './nodes';
import { useEditorClass } from './context';
import { Whiteboard } from '../components/Whiteboard';

// A drawing board in the task text. The teacher can draw, write and add pictures before class;
// it is live during the lesson, and the teacher decides who may draw.

function DrawBoardView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const { classId } = useEditorClass();
  const { user } = useAuth();
  return (
    <NodeViewWrapper className={'block-node drawboard-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">Board</span>
        <span className="hint">Prepare it now: draw, type or add pictures. It is live in the lesson.</span>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <input className="r-title" value={node.attrs.prompt ?? ''} placeholder="Title or instruction (optional)" onChange={(e) => updateAttributes({ prompt: e.target.value })} />
      {classId && user && node.attrs.id ? <Whiteboard classId={classId} boardId={node.attrs.id} uid={user.uid} teacher compact /> : <p className="hint">The board appears here.</p>}
    </NodeViewWrapper>
  );
}

export const DrawBoardNode = Node.create({
  name: 'drawBoard',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ id: { default: null }, prompt: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-drawboard]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-drawboard': '' })],
  // Drawing on the board must not move the editor's cursor or drag the block.
  addNodeView: () => ReactNodeViewRenderer(DrawBoardView, { stopEvent: ({ event }) => !!(event.target as HTMLElement | null)?.closest?.('.wb') }),
});

export const newDrawBoard = () => ({ type: 'drawBoard', attrs: { id: 'b' + newId(), prompt: '' } });

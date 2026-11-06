// Lessons made before the quiz show could hold a game block. The block still opens, so those lessons
// load as before, but the old games have gone: it says so and offers to remove itself.
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';

function View({ editor, deleteNode }: NodeViewProps) {
  return (
    <NodeViewWrapper contentEditable={false}>
      <section className="game-workspace">
        <p>
          <strong>An old game was here.</strong> Games are now live quizzes. In the lesson, choose Activities, then Live quiz.
        </p>
        {editor.isEditable && (
          <button type="button" className="btn" onClick={deleteNode}>
            Remove this block
          </button>
        )}
      </section>
    </NodeViewWrapper>
  );
}
export const GameNode = Node.create({
  name: 'classroomGame',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ id: { default: '' }, sessionId: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-classroom-game]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-classroom-game': '' })],
  addNodeView: () => ReactNodeViewRenderer(View),
});

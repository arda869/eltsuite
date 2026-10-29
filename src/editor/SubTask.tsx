import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import { Grip } from './nodes';

// Sub-tasks inside a task: a, b, c. Each has its own instruction line and its own content. On screen,
// learners see sub-task a first and open the next one with a small button; on paper they are all there,
// lettered under the exercise.

export const subLetter = (i: number) => String.fromCharCode(97 + (i % 26));

// The letter of the sub-task at a position: how many sub-tasks come before it in the task.
function letterAt(doc: NodeViewProps['editor']['state']['doc'], pos: number) {
  let n = 0;
  doc.descendants((node, p) => {
    if (p >= pos) return false;
    if (node.type.name === 'subTask') n++;
    return true;
  });
  return subLetter(n);
}

function SubTaskView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const pos = typeof getPos === 'function' ? getPos() : 0;
  const letter = letterAt(editor.state.doc, pos ?? 0);
  return (
    <NodeViewWrapper className={'subtask-node' + (selected ? ' is-selected' : '')}>
      <div className="st-ed-head" contentEditable={false}>
        <Grip editor={editor} getPos={getPos} />
        <b className="st-l" aria-label={`Sub-task ${letter}`}>
          {letter}
        </b>
        <input aria-label={`Instruction for sub-task ${letter}`} className="st-instr-input" value={node.attrs.instr ?? ''} placeholder="The instruction for this part" onChange={(e) => updateAttributes({ instr: e.target.value })} />
        <button type="button" className="remove" onClick={deleteNode}>
          Remove
        </button>
      </div>
      <NodeViewContent className="st-ed-body" />
    </NodeViewWrapper>
  );
}

export const SubTask = Node.create({
  name: 'subTask',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: '' },
    instr: { default: '' },
  }),
  parseHTML: () => [{ tag: 'section[data-subtask]' }],
  renderHTML: ({ HTMLAttributes }) => ['section', mergeAttributes(HTMLAttributes, { 'data-subtask': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(SubTaskView),
});

export const newSubTask = (instr = ''): JSONContent => ({ type: 'subTask', attrs: { id: 'st' + Math.random().toString(36).slice(2, 10), instr }, content: [{ type: 'paragraph' }] });

// The sub-tasks of a task, in order, with their letters.
export function subTasksOf(doc: JSONContent | null | undefined) {
  const out: JSONContent[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === 'subTask') out.push(n);
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return out;
}

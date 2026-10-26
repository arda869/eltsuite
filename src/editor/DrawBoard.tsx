import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { newId } from '../lib/tasks';
import { useAuth } from '../lib/auth';
import { Grip } from './nodes';
import { useEditorClass } from './context';
import { BoardTask, type BoardAttrs2 } from '../components/BoardTask';
import { useGroupSets } from '../lib/groups';

// A drawing board in the task text. The teacher can draw, write and add pictures before class;
// it is live during the lesson, and the teacher decides who may draw.

function DrawBoardView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const { classId, classmates } = useEditorClass();
  const { user } = useAuth();
  const sets = useGroupSets(classId);
  const seg = <K extends string>(list: [K, string][], cur: K, set: (k: K) => void, aria: string) => (
    <span className="seg small-seg" role="radiogroup" aria-label={aria}>
      {list.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={cur === k} className={cur === k ? 'on' : ''} onClick={() => set(k)}>
          {l}
        </button>
      ))}
    </span>
  );
  return (
    <NodeViewWrapper className={'block-node drawboard-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">Board</span>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <input className="r-title" value={node.attrs.prompt ?? ''} placeholder="Title or instruction (optional)" onChange={(e) => updateAttributes({ prompt: e.target.value })} />
      <div className="co-settings">
        <div className="md-set">
          <span>Who draws together</span>
          {seg(
            [
              ['class', 'The whole class'],
              ['group', 'Each group'],
              ['solo', 'Each learner'],
            ],
            node.attrs.scope ?? 'class',
            (k) => updateAttributes({ scope: k }),
            'Who draws together',
          )}
        </div>
        {(node.attrs.scope ?? 'class') !== 'class' && (
          <label className="md-set">
            <span>Groups</span>
            <select value={node.attrs.groupSet ?? ''} onChange={(e) => updateAttributes({ groupSet: e.target.value })}>
              <option value="">{sets.length ? 'The first group set' : 'No groups yet'}</option>
              {sets.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="md-set">
          <span>Shows</span>
          {seg(
            [
              ['inline', 'In the task'],
              ['expand', 'In the task, can enlarge'],
              ['full', 'Full screen'],
            ],
            node.attrs.display ?? 'expand',
            (k) => updateAttributes({ display: k }),
            'Shows',
          )}
        </div>
      </div>
      <span className="hint">{(node.attrs.scope ?? 'class') === 'class' ? 'Prepare it now: draw, type or add pictures. In the lesson you choose who draws, or lock it.' : (node.attrs.scope === 'group' ? 'Each group gets its own board' : 'Each learner gets their own board') + '; they draw on it unless you lock it.'}</span>
      {classId && user && node.attrs.id ? (
        <BoardTask a={node.attrs as BoardAttrs2} me={{ classId, taskId: '', uid: user.uid, name: 'Teacher', teacher: true }} classmates={classmates} />
      ) : (
        <p className="hint">The board appears here.</p>
      )}
    </NodeViewWrapper>
  );
}

export const DrawBoardNode = Node.create({
  name: 'drawBoard',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ id: { default: null }, prompt: { default: '' }, scope: { default: 'class' }, groupSet: { default: '' }, display: { default: 'expand' } }),
  parseHTML: () => [{ tag: 'div[data-drawboard]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-drawboard': '' })],
  // Drawing on the board must not move the editor's cursor or drag the block.
  addNodeView: () => ReactNodeViewRenderer(DrawBoardView, { stopEvent: ({ event }) => !!(event.target as HTMLElement | null)?.closest?.('.wb, .cd-top, .co-settings') }),
});

export const newDrawBoard = () => ({ type: 'drawBoard', attrs: { id: 'b' + newId(), prompt: '' } });

// A game inside a lesson task. The block holds the game's questions as its own content (so they're marked
// and kept like any other question in the task) and each question's settings in its attributes. In the
// editor it shows as a card; its questions are edited in the game editor, opened from the card.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useMyDocs } from '../lib/sharedDocs';
import { NSelect } from '../components/Select';
import { GameEditor } from './QuizFile';
import { GameControls, lessonFromUrl, useClassGames } from './InlineGame';
import { blockFromQuiz, freshIds, fromSaved, liveQuestions, quizFromBlock, quizProblems, type QuizDoc } from './model';
import './quiz.css';

function View({ node, editor, getPos, deleteNode }: NodeViewProps) {
  const id = String(node.attrs.id || '');
  const title = String(node.attrs.title || 'Game');
  const json = node.toJSON();
  const count = liveQuestions({ type: 'doc', content: json.content || [] }).length;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuizDoc | null>(null);
  const [name, setName] = useState(title);
  const at = lessonFromUrl();
  const games = useClassGames(at?.classId || '');
  const editable = editor.isEditable;
  useEffect(() => setName(title), [title]);
  // A new, empty game opens straight into the editor.
  useEffect(() => {
    if (editable && !count && !(node.attrs.sizes || []).length) open();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const replace = (q: QuizDoc, t: string) => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos === null || pos === undefined) return;
    const next = editor.schema.nodeFromJSON(blockFromQuiz(q, t, id));
    editor.chain().command(({ tr }) => (tr.replaceWith(pos, pos + node.nodeSize, next), true)).run();
  };
  function open() {
    setDraft(quizFromBlock(json));
    setName(title);
    setEditing(true);
  }
  const done = () => {
    if (draft) replace(draft, name.trim() || 'Game');
    setEditing(false);
  };
  return (
    <NodeViewWrapper className="ig ig-editor" contentEditable={false} data-game-block="">
      <header className="ig-head">
        <span className="ig-kicker">Game</span>
        <h3>{title}</h3>
        <span className="qe-hint">
          {count} {count === 1 ? 'question' : 'questions'} · learners play it here, live or at their own pace
        </span>
      </header>
      <div className="ig-controls">
        {editable && (
          <>
            <button type="button" className="btn small-btn primary" onClick={open}>
              Edit the game
            </button>
            <SavedGames onPick={(q, t) => replace(freshIds(q), t)} />
            <button type="button" className="btn small-btn" onClick={() => confirm('Remove this game from the task? Learners’ answers to it stay in their records.') && deleteNode()}>
              Remove
            </button>
          </>
        )}
      </div>
      {at?.classId && count > 0 && <GameControls classId={at.classId} itemId={at.itemId} blockId={id} running={games[id]} compact />}
      {editing &&
        draft &&
        createPortal(
          <div className="scrim" onClick={done}>
            <div className="dialog qe-dialog" role="dialog" aria-label="Edit the game" onClick={(e) => e.stopPropagation()}>
              <div className="qe-bar">
                <label className="field" style={{ flex: 1 }}>
                  Game name
                  <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                </label>
                <span className="qe-status">{quizProblems(draft).length ? 'Some questions need finishing' : 'Ready to play'}</span>
                <button type="button" className="btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button type="button" className="btn primary" onClick={done}>
                  Done
                </button>
              </div>
              <GameEditor quiz={draft} onChange={setDraft} canEdit />
            </div>
          </div>,
          document.body,
        )}
    </NodeViewWrapper>
  );
}

/** Copy one of the teacher's saved games into the block. */
function SavedGames({ onPick }: { onPick: (q: QuizDoc, title: string) => void }) {
  const { user } = useAuth();
  const { mine } = useMyDocs(user?.uid);
  const games = (mine || []).filter((d) => d.kind === 'game' && !d.deletedAt);
  if (!games.length) return null;
  return (
    <NSelect
      value=""
      aria-label="Use one of your saved games"
      onChange={async (e) => {
        const d = games.find((g) => g.id === e.target.value);
        if (!d || !confirm(`Use “${d.title}”? Its questions replace the ones in this game.`)) return;
        const snap = await getDoc(doc(db, 'sharedDocs', d.id, 'game', 'main'));
        onPick(fromSaved(snap.data()), d.title);
      }}
    >
      <option value="" disabled>
        Use one of your saved games
      </option>
      {games.map((g) => (
        <option key={g.id} value={g.id}>
          {g.title}
        </option>
      ))}
    </NSelect>
  );
}

export const GameBlock = Node.create({
  name: 'gameBlock',
  group: 'block',
  content: 'block*',
  atom: true,
  draggable: true,
  addAttributes: () => ({ id: { default: '' }, title: { default: 'Game' }, sizes: { default: [] }, settings: { default: [] }, source: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-game-block]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-game-block': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(View, { stopEvent: () => true }),
});

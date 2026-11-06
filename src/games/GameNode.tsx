import { lazy, Suspense, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useAuth } from '../lib/auth';
import { useMyDocs, newSharedDoc } from '../lib/sharedDocs';
import { gameApi } from './api';
import { GameSession } from './GameSession';
const GameFile = lazy(() => import('./GameFile').then(module => ({ default: module.GameFile })));

function View({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const { user } = useAuth();
  const { mine } = useMyDocs(user?.uid);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newGame, setNewGame] = useState('');
  const [newGameSaved, setNewGameSaved] = useState(false);
  const match = window.location.pathname.match(/^\/class\/([^/]+)/);
  const docMatch = window.location.pathname.match(/^\/doc\/([^/]+)/);
  const target = match ? { type: 'class', id: match[1] } : docMatch ? { type: 'doc', id: docMatch[1] } : null;

  const insert = async (id: string) => {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      const result = await gameApi('publish', { id, target });
      updateAttributes({ sessionId: result.id });
    } catch (e) {
      setError((e as Error).message || 'Save the game questions, then try inserting it again.');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const id = await newSharedDoc({ uid: user.uid, name: user.displayName || 'Teacher' }, 'game', 'Untitled Quiz Show');
      setNewGame(id);
      setNewGameSaved(false);
    } catch (e) {
      setError((e as Error).message || 'Could not create the game. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return <NodeViewWrapper contentEditable={false}>
    {node.attrs.sessionId ? <GameSession id={node.attrs.sessionId} /> : <section className="game-workspace">
      <h3>Add a Quiz Show</h3>
      {error && <p role="alert">{error}</p>}
      {!target && <p>Save and open this class lesson or document before inserting a game.</p>}
      {newGame && <div className="game-return-action"><p>Build and save your Quiz Show here, then insert it into this activity.</p>{mine?.find(d => d.id === newGame) ? <Suspense fallback={<p role="status">Opening the game editor…</p>}><GameFile d={mine.find(d => d.id === newGame)!} canEdit onSaved={() => setNewGameSaved(true)} onChanged={() => setNewGameSaved(false)} /></Suspense> : <p role="status">Opening the game editor…</p>}<button type="button" className="btn primary" disabled={busy || !target || !newGameSaved} onClick={() => void insert(newGame)}>Insert saved game</button>{!newGameSaved && <p>Save the game to enable insertion.</p>}</div>}
      {mine?.filter(d => d.kind === 'game' && d.id !== newGame).map(d => <button type="button" className="btn" key={d.id} disabled={busy || !target} onClick={() => void insert(d.id)}>{d.title}</button>)}
      <button type="button" className="btn" disabled={!user || busy} onClick={() => void create()}>Create a new Quiz Show</button>
    </section>}
    {editor.isEditable && <button type="button" className="btn" onClick={deleteNode}>Remove game</button>}
  </NodeViewWrapper>;
}

export const GameNode = Node.create({ name: 'classroomGame', group: 'block', atom: true, draggable: true, addAttributes: () => ({ id: { default: '' }, sessionId: { default: '' } }), parseHTML: () => [{ tag: 'div[data-classroom-game]' }], renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-classroom-game': '' })], addNodeView: () => ReactNodeViewRenderer(View) });
